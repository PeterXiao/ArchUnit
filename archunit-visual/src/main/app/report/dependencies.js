'use strict';

import initDependency from './dependency.js';
import {buildFilterGroup} from './filter';

const init = (View) => {

  const arrayDifference = (arr1, arr2) => arr1.filter(x => arr2.indexOf(x) < 0);

  let nodes = new Map();
  let dependencyCreator;

  const fullNameStartsWithOtherFullName = (fullName, prefix) => nodes.getByName(prefix).isPredecessorOfNodeOrItself(nodes.getByName(fullName));

  const filter = dependencies => ({
    by: propertyFunc => ({
      startsWith: prefix => dependencies.filter(r =>
        fullNameStartsWithOtherFullName(propertyFunc(r), prefix)),
      equals: fullName => dependencies.filter(r => propertyFunc(r) === fullName)
    })
  });

  const split = dependencies => ({
    by: propertyFunc => ({
      startsWith: prefix => {
        const matching = [];
        const notMatching = [];
        dependencies.forEach(d => (fullNameStartsWithOtherFullName(propertyFunc(d), prefix) ? matching : notMatching).push(d));
        return {matching, notMatching};
      }
    })
  });

  const uniteDependencies = (dependencies, svgElement, callForAllViews, getDetailedDependencies) => {
    const tmp = dependencies.map(r => ({key: r.from + '->' + r.to, dependency: r}));
    const map = new Map();
    tmp.forEach(e => map.set(e.key, []));
    tmp.forEach(e => map.get(e.key).push(e.dependency));

    return [...map.values()].map(dependencies =>
      dependencyCreator.getUniqueDependency(dependencies[0].from, dependencies[0].to, svgElement, callForAllViews, getDetailedDependencies)
        .byGroupingDependencies(dependencies));
  };

  const transform = dependencies => ({
    where: propertyFunc => ({
      startsWith: prefix => ({
        eliminateSelfDeps: noSelfDeps => ({
          to: transformer => {
            const splitResult = split(dependencies).by(propertyFunc).startsWith(prefix);
            const matching = splitResult.matching;
            const rest = splitResult.notMatching;
            let folded = matching.map(transformer);
            if (noSelfDeps) {
              folded = folded.filter(r => r.from !== r.to);
            }
            return [...rest, ...folded];
          }
        })
      })
    })
  });

  const foldTransformer = foldedElement => (
    dependencies => {
      const targetFolded = transform(dependencies).where(r => r.to).startsWith(foldedElement).eliminateSelfDeps(false)
        .to(r => dependencyCreator.shiftElementaryDependency(r, r.from, foldedElement));
      return transform(targetFolded).where(r => r.from).startsWith(foldedElement).eliminateSelfDeps(true)
        .to(r => dependencyCreator.shiftElementaryDependency(r, foldedElement, r.to));
    }
  );

  const applyTransformersOnDependencies = (transformers, dependencies) => Array.from(transformers)
    .reduce((mappedDependencies, transformer) => transformer(mappedDependencies), dependencies);

  //TODO: maybe extract to own file and create tests??
  const Violations = class {
    constructor() {
      this._violationGroups = new Map();
      this.violationsSet = new Set();
    }

    containsDependency(dependency) {
      return this.violationsSet.has(dependency.description);
    }

    isEmpty() {
      return this._violationGroups.size === 0;
    }

    _recreateViolationsSet() {
      this.violationsSet = new Set([].concat.apply([], Array.from(this._violationGroups.values())
        .map(violationGroup => violationGroup.violations)));
    }

    addViolationGroup(violationGroup, elementaryDependencies) {
      this._violationGroups.set(violationGroup.rule, violationGroup);
      this._recreateViolationsSet();
      this.refreshMarkOfViolationDependencies(elementaryDependencies);
    }

    removeViolationGroup(violationGroup, elementaryDependencies) {
      this._violationGroups.delete(violationGroup.rule);
      this._recreateViolationsSet();
      this.refreshMarkOfViolationDependencies(elementaryDependencies);
    }

    refreshMarkOfViolationDependencies(dependencies) {
      dependencies.forEach(dependency => dependency.unMarkAsViolation());
      dependencies.filter(dependency => this.containsDependency(dependency)).forEach(dependency => dependency.markAsViolation());
    }

    getFilter() {
      return dependency => this.isEmpty() || this.containsDependency(dependency);
    }
  };

  const makeUniqueByProperty = (arr, propertyFunc) => {
    const map = new Map();
    arr.forEach(d => map.set(propertyFunc(d), d));
    return [...map.values()];
  };

  /**
   * selects all transformers whose key-node has no predecessor in the transformers.key()-array
   * @param transformers Map nodeFullName->transformer
   * @return {*} all transformers that fulfill the property described above
   */
  const getTransformersOfTopMostNodes = transformers => {
    const sortedKeys = Array.from(transformers.keys()).sort((node1, node2) => node1.length - node2.length);
    const res = new Set();
    sortedKeys.forEach(nodeFullName => {
      const selfAndPredecessors = nodes.getByName(nodeFullName).getSelfAndPredecessors();
      if (!selfAndPredecessors.some(predecessor => res.has(predecessor.getFullName()))) {
        res.add(nodeFullName);
      }
    });
    return Array.from(transformers.entries()).filter(entry => res.has(entry[0])).map(entry => entry[1]);
  };

  const Dependencies = class {
    constructor(jsonDependencies, nodeMap, svgContainer) {
      nodes = nodeMap;
      dependencyCreator = initDependency(View, nodeMap);

      this._violations = new Violations();

      this._transformers = new Map();
      this._elementary = jsonDependencies.map(jsonDependency =>
        dependencyCreator.createElementaryDependency(jsonDependency));

      this._dependencyTypes = [...new Set(this._elementary.map(d => d.type))].concat(dependencyCreator.getOwnDependencyTypes());

      this._filterGroup = buildFilterGroup('dependencies', this.getFilterObject())
        .addStaticFilter('type', () => true)
        .withStaticFilterPrecondition(true)
        .addDynamicFilter('nodeTypeAndName', () => this.getNodeTypeAndNameFilter())
        .withStaticFilterPrecondition(true)
        .addDynamicFilter('violations', () => this._violations.getFilter())
        .withStaticFilterPrecondition(false)
        .addDynamicFilter('visibleNodes', () => this.getVisibleNodesFilter(), [])
        .withStaticFilterPrecondition(true)
        .build();

      this._filtered = this._elementary;
      this._svgContainer = svgContainer;
      this._updatePromise = Promise.resolve();
      this.doNext = fun => this._updatePromise = this._updatePromise.then(fun);
    }

    get filterGroup() {
      return this._filterGroup;
    }

    get dependencyTypes() {
      return this._dependencyTypes;
    }

    getFilterObject() {
      return {
        runFilter: (filter, key) => this._elementary.forEach(d => d.setMatchesFilter(key, filter(d))),

        applyFilters: () => {
          this._filtered = this._elementary.filter(d => d.matchesAllFilters());
          this.recreateVisible();
        }
      };
    }

    changeTypeFilter(typeFilterConfig) {
      this._filterGroup.getFilter('type').filter = this.getTypeFilter(typeFilterConfig);
    }

    //TODO: maybe keep only one dependency of possible mutual dependencies
    getAllLinks() {
      const createSimpleDependency = (from, to) => ({source: from, target: to});
      const simpleDependencies = this.getVisible().map(dependency => createSimpleDependency(dependency.from, dependency.to));

      const groupedTransferredSimpleDependencies = simpleDependencies.map(dep => {
        const sourceNode = nodes.getByName(dep.source);
        const targetNode = nodes.getByName(dep.target);

        if (sourceNode.isPredecessorOf(dep.target) || targetNode.isPredecessorOf(dep.source)) {
          return [dep];
        }

        const firstCommonPredecessor = sourceNode.getSelfOrFirstPredecessorMatching(node => node.isPredecessorOf(dep.target));
        const sourcePredecessors = sourceNode.getSelfAndPredecessorsUntilExclusively(firstCommonPredecessor);
        const targetPredecessors = targetNode.getSelfAndPredecessorsUntilExclusively(firstCommonPredecessor);

        const predecessorsTupleOrderByLengthAscending = [sourcePredecessors, targetPredecessors].sort((a, b) => a.length - b.length);
        const shortPredecessors = predecessorsTupleOrderByLengthAscending[0];
        const longPredecessors = predecessorsTupleOrderByLengthAscending[1];
        const peerLinks = shortPredecessors.map((node, i) => createSimpleDependency(node.getFullName(), longPredecessors[i].getFullName()));
        const lastNodeFullName = shortPredecessors[shortPredecessors.length - 1].getFullName();
        const remainingLinks = longPredecessors.slice(shortPredecessors.length).map(node => createSimpleDependency(lastNodeFullName, node.getFullName()));
        return [...peerLinks, ...remainingLinks];
      });

      const transferredSimpleDependencies = [].concat.apply([], groupedTransferredSimpleDependencies);
      const map = new Map();
      transferredSimpleDependencies.forEach(dep => map.set(dep.source + '->' + dep.target, dep));
      return Array.from(map.values());
    }

    showViolations(violationGroup) {
      this._violations.addViolationGroup(violationGroup, this._elementary);
    }

    hideViolations(violationGroup) {
      this._violations.removeViolationGroup(violationGroup, this._elementary);
    }

    _getViolationDependencies() {
      return this._filtered.filter(d => this._violations.containsDependency(d));
    }

    getNodesContainingViolations() {
      const violationDependencies = this._getViolationDependencies();
      const everyFirstCommonPredecessor = violationDependencies.map(d =>
        nodes.getByName(d.from).getSelfOrFirstPredecessorMatching(node => node.isPredecessorOf(d.to)));
      const distinctNodes = new Map(everyFirstCommonPredecessor.map(node => [node.getFullName(), node])).values();
      return [...distinctNodes];
    }

    getNodesInvolvedInVisibleViolations() {
      const violationDependencies = this._elementary.filter(d => this._violations.containsDependency(d)
        && d.matchesFilter('type') && d.matchesFilter('nodeTypeAndName'));
      const nodesInvolvedInViolations = violationDependencies.map(d => nodes.getByName(d.from)).concat(violationDependencies.map(d => nodes.getByName(d.to)));
      return new Set(nodesInvolvedInViolations);
    }

    getHasNodeVisibleViolation() {
      const nodesInvolvedInVisibleViolations = this.getNodesInvolvedInVisibleViolations();
      return node => this._violations.isEmpty() || nodesInvolvedInVisibleViolations.has(node);
    }

    createListener() {
      return {
        onDrag: node => this.jumpSpecificDependenciesToTheirPositions(node),
        onFold: node => this.updateOnNodeFolded(node.getFullName(), node.isFolded()),
        onInitialFold: node => this.noteThatNodeFolded(node.getFullName(), node.isFolded()),
        onLayoutChanged: () => this.moveAllToTheirPositions(),
        onNodesOverlapping: (fullNameOfOverlappedNode, positionOfOverlappingNode) => this._hideDependenciesOnNodesOverlapping(fullNameOfOverlappedNode, positionOfOverlappingNode),
        resetNodesOverlapping: () => this._resetVisibility(),
        finishOnNodesOverlapping: () => this.getVisible().forEach(d => d._view._showIfVisible(d))
      }
    }

    recreateVisible() {
      const visibleDependenciesBefore = this._visibleDependencies || [];

      const relevantTransformers = getTransformersOfTopMostNodes(this._transformers);
      const transformedDependencies = applyTransformersOnDependencies(relevantTransformers, this._filtered);
      this._visibleDependencies = uniteDependencies(transformedDependencies,
        this._svgContainer,
        fun => this.getVisible().forEach(d => fun(d._view)),
        (from, to) => this.getDetailedDependenciesOf(from, to));

      this._setMustShareNodes();
      this._visibleDependencies.forEach(d => d._isVisible = true);
      this._updateViewsOnVisibleDependenciesChanged(visibleDependenciesBefore);
    }

    _setMustShareNodes() {
      const swappedDependenciesSet = new Set(this._visibleDependencies.map(d => `${d.to}-${d.from}`));
      const setMustShareNodes = d => d.visualData.mustShareNodes = swappedDependenciesSet.has(`${d.from}-${d.to}`);
      this._visibleDependencies.forEach(setMustShareNodes);
    }

    _resetVisibility() {
      this.getVisible().forEach(dependency => dependency._isVisible = true);
    }

    _hideDependenciesOnNodesOverlapping(fullNameOfOverlappedNode, positionOfOverlappingNode) {
      this.getVisible().filter(d => d.from === fullNameOfOverlappedNode).forEach(dependency => dependency.hideOnStartOverlapping(positionOfOverlappingNode));
      this.getVisible().filter(d => d.to === fullNameOfOverlappedNode).forEach(dependency => dependency.hideOnTargetOverlapping(positionOfOverlappingNode));
    }

    _updateViewsOnVisibleDependenciesChanged(dependenciesBefore) {
      arrayDifference(dependenciesBefore, this.getVisible()).forEach(d => d.hide());
    }

    jumpSpecificDependenciesToTheirPositions(node) {
      this.getVisible().filter(d => node.isPredecessorOfOrNodeItself(d.from) || node.isPredecessorOfOrNodeItself(d.to)).forEach(d => d.jumpToPosition());
    }

    moveAllToTheirPositions() {
      return this.doNext(() => Promise.all(this.getVisible().map(d => d.moveToPosition())));
    }

    noteThatNodeFolded(foldedNode, isFolded) {
      if (isFolded) {
        this._transformers.set(foldedNode, foldTransformer(foldedNode));
      } else {
        this._transformers.delete(foldedNode);
      }
    }

    updateOnNodeFolded(foldedNode, isFolded) {
      if (isFolded) {
        this._transformers.set(foldedNode, foldTransformer(foldedNode));
      } else {
        this._transformers.delete(foldedNode);
      }
      this.recreateVisible();
    }

    getNodeTypeAndNameFilter() {
      return d => {
        return nodes.getByName(d.from).matchesFilter('typeAndName')
          && nodes.getByName(d.to).matchesFilter('typeAndName');
      }
    }

    getVisibleNodesFilter() {
      return d => nodes.getByName(d.from).matchesFilter('combinedFilter') && nodes.getByName(d.to).matchesFilter('combinedFilter');
    }

    getTypeFilter(typeFilterConfig) {
      return dependency => this.dependencyTypes.every(type => dependency.type !== type || typeFilterConfig[type])
        && ((!dependency.getStartNode().isPredecessorOfOrNodeItself(dependency.getEndNode().getFullName())
            && !dependency.getEndNode().isPredecessorOfOrNodeItself(dependency.getStartNode().getFullName()))
          || typeFilterConfig.INNERCLASS_DEPENDENCY);
    }

    getVisible() {
      return this._visibleDependencies;
    }

    getDistinctNodesHavingDependencies() {
      const nodeFullNames = this.getVisible().map(dep => dep.from).concat(this.getVisible().map(dep => dep.to));
      return new Map(nodeFullNames.map(nodeFullName => [nodeFullName, nodes.getByName(nodeFullName)]));
    }

    getDetailedDependenciesOf(from, to) {
      const getDependenciesMatching = (dependencies, propertyFunc, depEnd) => {
        const matchingDependencies = filter(dependencies).by(propertyFunc);
        const startNode = nodes.getByName(depEnd);
        if (startNode.isPackage() || startNode.isCurrentlyLeaf()) {
          return matchingDependencies.startsWith(depEnd);
        } else {
          return matchingDependencies.equals(depEnd);
        }
      };
      let matching = getDependenciesMatching(this._filtered, d => d.from, from);
      matching = getDependenciesMatching(matching, d => d.to, to);
      const detailedDeps = matching.map(d => d.description);
      return makeUniqueByProperty(detailedDeps, d => d);
    }
  };

  return Dependencies;
};

export default {init};