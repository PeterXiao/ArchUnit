'use strict';

import chai from 'chai';
import './chai/dependencies-chai-extension';
import './chai/node-chai-extensions';
import stubs from './stubs';
import testJson from './test-json-creator';
import AppContext from '../../../main/app/report/app-context';
import {buildFilterCollection} from "../../../main/app/report/filter";

const expect = chai.expect;

const appContext = AppContext.newInstance({
  visualizationStyles: stubs.visualizationStylesStub(30),
  calculateTextWidth: stubs.calculateTextWidthStub,
  NodeView: stubs.NodeViewStub,
  DependencyView: stubs.DependencyViewStub
});
const Root = appContext.getRoot();
const Dependencies = appContext.getDependencies();

const updateFilterAndRelayout = (root, filterCollection, filterKey) => {
  root.doNextAndWaitFor(() => filterCollection.updateFilter(filterKey));
  root.relayoutCompletely();
};

/*
 * json-root with every kind of dependency of both groups (inheritance and access),
 * several different dependencies from one class to another one,
 * dependencies between a class and its inner class
 * and mutual dependencies (between separated classes and a class and its inner class)
 */
const jsonRoot = testJson.package('com.tngtech')
  .add(testJson.package('pkg1')
    .add(testJson.clazz('SomeClass1', 'class')
      .callingMethod('com.tngtech.pkg1.SomeClass2', 'startMethod(arg1, arg2)', 'targetMethod()')
      .accessingField('com.tngtech.pkg1.SomeClass2', 'startMethod(arg1, arg2)', 'targetField')
      .implementing('com.tngtech.pkg2.SomeInterface1')
      .build())
    .add(testJson.clazz('SomeClass2', 'class')
      .accessingField('com.tngtech.pkg1.SomeClass1', 'startMethod(arg)', 'targetField')
      .build())
    .build())
  .add(testJson.package('pkg2')
    .add(testJson.clazz('SomeInterface1', 'interface').build())
    .add(testJson.package('subpkg1')
      .add(testJson.clazz('SomeClass1', 'class')
        .extending('com.tngtech.pkg1.SomeClass1')
        .callingConstructor('com.tngtech.pkg1.SomeClass1', '<init>()', '<init>()')
        .build())
      .add(testJson.clazz('SomeClassWithInnerInterface', 'class')
        .havingInnerClass(testJson.clazz('SomeInnerInterface', 'interface')
          .callingMethod('com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface', 'startMethod(arg)', 'targetMethod(arg1, arg2)')
          .build())
        .implementingAnonymous('com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface')
        .build())
      .build())
    .build())
  .add(testJson.clazz('SomeClassWithInnerClass', 'class')
    .implementingAnonymous('com.tngtech.pkg2.SomeInterface1')
    .havingInnerClass(testJson.clazz('SomeInnerClass', 'class')
      .accessingField('com.tngtech.SomeClassWithInnerClass', 'startMethod1()', 'targetField')
      .accessingField('com.tngtech.SomeClassWithInnerClass', 'startMethod2()', 'targetField')
      .build())
    .build())
  .build();
const root = new Root(jsonRoot, null, () => Promise.resolve());

const jsonRootWithTwoClassesAndTwoDeps = testJson.package('com.tngtech')
  .add(testJson.clazz('SomeClass1', 'class')
    .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField').build())
  .add(testJson.clazz('SomeClass2', 'class')
    .accessingField('com.tngtech.SomeClass1', 'startMethod()', 'targetField').build())
  .build();
const rootWithTwoClassesAndTwoDeps = new Root(jsonRootWithTwoClassesAndTwoDeps, null, () => Promise.resolve());

describe('Dependencies', () => {
  it('creates correct elementary dependencies from json-input', () => {
    const dependencies = new Dependencies(jsonRoot, root);
    const exp = [
      'com.tngtech.pkg1.SomeClass1->com.tngtech.pkg1.SomeClass2(startMethod(arg1, arg2) methodCall targetMethod())',
      'com.tngtech.pkg1.SomeClass1->com.tngtech.pkg1.SomeClass2(startMethod(arg1, arg2) fieldAccess targetField)',
      'com.tngtech.pkg1.SomeClass1->com.tngtech.pkg2.SomeInterface1(implements)',
      'com.tngtech.pkg1.SomeClass2->com.tngtech.pkg1.SomeClass1(startMethod(arg) fieldAccess targetField)',
      'com.tngtech.pkg2.subpkg1.SomeClass1->com.tngtech.pkg1.SomeClass1(extends)',
      'com.tngtech.pkg2.subpkg1.SomeClass1->com.tngtech.pkg1.SomeClass1(<init>() constructorCall <init>())',
      'com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface->com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface(startMethod(arg) methodCall targetMethod(arg1, arg2))',
      'com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface->com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface(implementsAnonymous)',
      'com.tngtech.SomeClassWithInnerClass->com.tngtech.pkg2.SomeInterface1(implementsAnonymous)',
      'com.tngtech.SomeClassWithInnerClass$SomeInnerClass->com.tngtech.SomeClassWithInnerClass(startMethod1() fieldAccess targetField)',
      'com.tngtech.SomeClassWithInnerClass$SomeInnerClass->com.tngtech.SomeClassWithInnerClass(startMethod2() fieldAccess targetField)'
    ];
    expect(dependencies._elementary).to.haveDependencyStrings(exp);
  });

  it('creates correct visible dependencies from the elementary dependencies', () => {
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();
    const exp = [
      'com.tngtech.pkg1.SomeClass1->com.tngtech.pkg1.SomeClass2(several)',
      'com.tngtech.pkg1.SomeClass1->com.tngtech.pkg2.SomeInterface1(implements)',
      'com.tngtech.pkg1.SomeClass2->com.tngtech.pkg1.SomeClass1(fieldAccess)',
      'com.tngtech.pkg2.subpkg1.SomeClass1->com.tngtech.pkg1.SomeClass1(extends constructorCall)',
      'com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface->com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface(methodCall)',
      'com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface->com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface(implementsAnonymous)',
      'com.tngtech.SomeClassWithInnerClass->com.tngtech.pkg2.SomeInterface1(implementsAnonymous)',
      'com.tngtech.SomeClassWithInnerClass$SomeInnerClass->com.tngtech.SomeClassWithInnerClass(fieldAccess)'
    ];
    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
    expect(dependencies.getVisible().map(dependency => dependency.isVisible())).to.not.include(false);
  });

  it('know if they must share one of the end nodes', () => {
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();
    const hasEndNodes = (node1, node2) => d => (d.from === node1 || d.to === node1) && (d.from === node2 || d.to === node2);
    const filter = d => hasEndNodes('com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface',
      'com.tngtech.pkg2.subpkg1.SomeClassWithInnerInterface$SomeInnerInterface')(d)
      || hasEndNodes('com.tngtech.pkg1.SomeClass1', 'com.tngtech.pkg1.SomeClass2')(d);
    const dependenciesSharingNodes = dependencies.getVisible().filter(filter);
    const mapToMustShareNodes = dependencies => dependencies.map(d => d.visualData.mustShareNodes);
    expect(mapToMustShareNodes(dependenciesSharingNodes)).to.not.include(false);
    expect(mapToMustShareNodes(dependencies.getVisible().filter(d => !filter(d)))).to.not.include(true);
  });

  it('should recreate correctly its visible dependencies after folding a package: old dependencies are hidden, ' +
    'all new ones are visible but they are not re-instantiated', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('TargetClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const filterForHiddenDependencies = d => d.from === 'com.tngtech.startPkg.StartClass';
    const hiddenDependencies = dependencies.getVisible().filter(filterForHiddenDependencies);
    const visibleDependencies = dependencies.getVisible().filter(d => !filterForHiddenDependencies(d));

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);

    expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
    expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
    expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);

    //ensure that the dependencies are not recreated
    expect(dependencies.getVisible()).to.include.members(visibleDependencies);
  });

  it('should recreate correctly its visible dependencies after folding several nodes: old dependencies are hidden, ' +
    'all new ones are visible but they are not re-instantiated, dependencies are correctly transformed', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('pkg1')
        .add(testJson.clazz('SomeClass', 'class')
          .callingMethod('com.tngtech.pkg2.SomeClass', 'startMethod()', 'targetMethod')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.package('pkg2')
        .add(testJson.clazz('SomeClass', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const filterForHiddenDependencies = d => d.from === 'com.tngtech.pkg1.SomeClass' ||
      d.from === 'com.tngtech.pkg2.SomeClass' || d.to === 'com.tngtech.pkg2.SomeClass';
    const hiddenDependencies = dependencies.getVisible().filter(filterForHiddenDependencies);
    const visibleDependencies = dependencies.getVisible().filter(d => !filterForHiddenDependencies(d));

    dependencies.noteThatNodeFolded('com.tngtech.pkg1', true);
    dependencies.noteThatNodeFolded('com.tngtech.pkg2', true);
    dependencies.recreateVisible();

    expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
    expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
    expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);

    //ensure that the dependencies are not recreated
    expect(dependencies.getVisible()).to.include.members(visibleDependencies);

    const exp = [
      'com.tngtech.pkg1->com.tngtech.pkg2()',
      'com.tngtech.pkg1->com.tngtech.SomeInterface()',
      'com.tngtech.pkg2->com.tngtech.SomeInterface()',
      'com.tngtech.SomeClass->com.tngtech.SomeInterface(implements)'
    ];

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should recreate its visible dependencies correctly after folding a class with an inner class: old dependencies ' +
    'are hidden, all new ones are visible but they are not re-instantiated', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('StartClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('InnerClass', 'class')
          .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
          .build())
        .implementing('com.tngtech.SomeInterface')
        .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
        .build())
      .add(testJson.clazz('TargetClass', 'class')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const filterForHiddenDependencies = d => d.from === 'com.tngtech.StartClassWithInnerClass$InnerClass';
    const hiddenDependencies = dependencies.getVisible().filter(filterForHiddenDependencies);
    const visibleDependencies = dependencies.getVisible().filter(d => !filterForHiddenDependencies(d));

    dependencies.updateOnNodeFolded('com.tngtech.StartClassWithInnerClass', true);

    expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
    expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
    expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);
    expect(dependencies.getVisible()).to.include.members(visibleDependencies);
  });

  it('should recreate correctly its visible dependencies after unfolding a package: old dependencies are hidden, ' +
    'all new ones are visible but they are not re-instantiated', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('TargetClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const visibleDependencies1 = dependencies.getVisible().filter(d => d.from === 'com.tngtech.startPkg.StartClass');

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);

    const filterForHiddenDependencies = d => d.from === 'com.tngtech.startPkg';
    const hiddenDependencies = dependencies.getVisible().filter(filterForHiddenDependencies);
    const visibleDependencies2 = dependencies.getVisible().filter(d => !filterForHiddenDependencies(d));

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', false);

    expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
    expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
    expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);
    expect(dependencies.getVisible()).to.include.members(visibleDependencies1);
    expect(dependencies.getVisible()).to.include.members(visibleDependencies2);
  });

  it('should update whether they must share one of the end nodes after folding', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('ClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('InnerClass', 'class')
          .callingConstructor('com.tngtech.SomeClass', '<init>()', '<init>()')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.ClassWithInnerClass', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    dependencies.updateOnNodeFolded('com.tngtech.ClassWithInnerClass', true);

    const mapToMustShareNodes = dependencies => dependencies.map(d => d.visualData.mustShareNodes);
    expect(mapToMustShareNodes(dependencies.getVisible())).to.not.include(false);
  });

  it('should update whether they must share one of the end nodes after unfolding ', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('ClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('InnerClass', 'class')
          .callingConstructor('com.tngtech.SomeClass', '<init>()', '<init>()')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.ClassWithInnerClass', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    dependencies.updateOnNodeFolded('com.tngtech.ClassWithInnerClass', true);
    dependencies.updateOnNodeFolded('com.tngtech.ClassWithInnerClass', false);

    const mapToMustShareNodes = dependencies => dependencies.map(d => d.visualData.mustShareNodes);
    expect(mapToMustShareNodes(dependencies.getVisible())).to.not.include(true);
  });

  it('should be transformed correctly if the parent-package of the start-node is folded', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('TargetClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      'com.tngtech.startPkg->com.tngtech.TargetClass()',
      'com.tngtech.startPkg->com.tngtech.SomeInterface()',
      'com.tngtech.TargetClass->com.tngtech.SomeInterface(implements)'
    ];

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if the parent-package of the end-node is folded', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface')
        .callingConstructor('com.tngtech.targetPkg.TargetClass', 'startMethod()', '<init>()').build())
      .add(testJson.package('targetPkg')
        .add(testJson.clazz('TargetClass', 'class').build())
        .build())
      .add(testJson.clazz('StartClass', 'class')
        .callingMethod('com.tngtech.targetPkg.TargetClass', 'startMethod()', 'targetMethod')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      'com.tngtech.StartClass->com.tngtech.targetPkg()',
      'com.tngtech.SomeInterface->com.tngtech.targetPkg()',
      'com.tngtech.StartClass->com.tngtech.SomeInterface(implements)'
    ];

    dependencies.updateOnNodeFolded('com.tngtech.targetPkg', true);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if the parent-package of the end-node and the parent-package of the start-node are folded', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.package('targetPkg')
        .add(testJson.clazz('TargetClass', 'class').build())
        .build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.targetPkg.TargetClass', 'startMethod()', 'targetMethod')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      'com.tngtech.startPkg->com.tngtech.targetPkg()'
    ];

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.targetPkg', true);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if the parent-class of the start-node is folded', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.package('targetPkg')
        .add(testJson.clazz('TargetClass', 'class').build())
        .build())
      .add(testJson.clazz('StartClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.targetPkg.TargetClass', 'startMethod()', 'targetMethod')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      'com.tngtech.StartClassWithInnerClass->com.tngtech.targetPkg.TargetClass(childrenAccess)'
    ];

    dependencies.updateOnNodeFolded('com.tngtech.StartClassWithInnerClass', true);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if a package is unfolded again', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.TargetClass', 'startMethod()', 'targetMethod')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('TargetClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      'com.tngtech.startPkg.StartClass->com.tngtech.TargetClass(methodCall)',
      'com.tngtech.startPkg.StartClass->com.tngtech.SomeInterface(implements)',
      'com.tngtech.TargetClass->com.tngtech.SomeInterface(implements)'
    ];

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.startPkg', false);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if two packages are unfolded again', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.package('targetPkg')
        .add(testJson.clazz('TargetClass', 'class').build())
        .build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.targetPkg.TargetClass', 'startMethod()', 'targetMethod')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = ['com.tngtech.startPkg.StartClass->com.tngtech.targetPkg.TargetClass(methodCall)'];

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.targetPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.startPkg', false);
    dependencies.updateOnNodeFolded('com.tngtech.targetPkg', false);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('should be transformed correctly if a package is unfolded again, when another package is folded', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.package('targetPkg')
        .add(testJson.clazz('TargetClass', 'class').build())
        .build())
      .add(testJson.package('startPkg')
        .add(testJson.clazz('StartClass', 'class')
          .callingMethod('com.tngtech.targetPkg.TargetClass', 'startMethod()', 'targetMethod')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = ['com.tngtech.startPkg.StartClass->com.tngtech.targetPkg()'];

    dependencies.updateOnNodeFolded('com.tngtech.startPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.targetPkg', true);
    dependencies.updateOnNodeFolded('com.tngtech.startPkg', false);

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can jump the dependencies of a specific node to their positions', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClass1', 'class')
        .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField')
        .build())
      .add(testJson.clazz('SomeClass2', 'class')
        .callingMethod('com.tngtech.SomeClass1', 'startMethod()', 'targetMethod()')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const draggedNode = 'com.tngtech.SomeClass1';
    const filter = d => d.from === draggedNode || d.to === draggedNode;
    const jumpedDependencies = dependencies.getVisible().filter(filter);
    const notJumpedDependences = dependencies.getVisible().filter(d => !filter(d));

    dependencies.jumpSpecificDependenciesToTheirPositions(root.getByName(draggedNode));

    const mapDependenciesToHasJumped = dependencies => dependencies.map(d => d._view.hasJumpedToPosition);
    expect(mapDependenciesToHasJumped(jumpedDependencies)).to.not.include(false);
    expect(mapDependenciesToHasJumped(notJumpedDependences)).to.not.include(true);
  });

  it('can move all dependencies to their positions', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClass1', 'class')
        .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField')
        .build())
      .add(testJson.clazz('SomeClass2', 'class')
        .callingMethod('com.tngtech.SomeClass1', 'startMethod()', 'targetMethod()')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const promise = dependencies.moveAllToTheirPositions();

    const mapDependenciesToHasMoved = dependencies => dependencies.map(d => d._view.hasMovedToPosition);
    return promise.then(() => expect(mapDependenciesToHasMoved(dependencies.getVisible())).to.not.include(false));
  });

  it('can move all dependencies to their positions twice in a row: the second move does not start before the first is ended', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClass1', 'class')
        .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField')
        .build())
      .add(testJson.clazz('SomeClass2', 'class')
        .callingMethod('com.tngtech.SomeClass1', 'startMethod()', 'targetMethod()')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();
    const exp = [
      'com.tngtech.SomeClass1->com.tngtech.SomeClass2(fieldAccess)',
      'com.tngtech.SomeClass2->com.tngtech.SomeClass1(methodCall)',
      'com.tngtech.SomeClass2->com.tngtech.SomeInterface(implements)',
    ];
    const movedDependenciesFirstTime = [];
    const movedDependenciesSecondTime = [];
    stubs.saveMovedDependenciesTo(movedDependenciesFirstTime);

    dependencies.moveAllToTheirPositions().then(() => stubs.saveMovedDependenciesTo(movedDependenciesSecondTime));
    const promise = dependencies.moveAllToTheirPositions();

    return promise.then(() => {
      /**
       * when the both invokes of moveAllToTheirPositions above are not executed after each other,
       * then the dependencies are not added to the second array
       */
      expect(movedDependenciesFirstTime).to.haveDependencyStrings(exp);
      expect(movedDependenciesSecondTime).to.haveDependencyStrings(exp);
    });
  });

  it('sets and applies the node filter correctly', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('MatchingClass1', 'class')
        .implementing('com.tngtech.SomeInterface')
        .callingConstructor('com.tngtech.MatchingClass2', 'startMethod()', '<init>()')
        .build())
      .add(testJson.clazz('MatchingClass2', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('SomeInterface', 'interface')
        .accessingField('com.tngtech.SomeClass1', 'startMethod()', 'targetField')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = [
      'com.tngtech.MatchingClass1->com.tngtech.MatchingClass2(constructorCall)',
      'com.tngtech.MatchingClass2->com.tngtech.MatchingClass1(methodCall)'
    ];

    root.nameFilterString = '*Matching*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('resets the node filter correctly', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('MatchingClass1', 'class')
        .implementing('com.tngtech.SomeInterface')
        .callingConstructor('com.tngtech.MatchingClass2', 'startMethod()', '<init>()')
        .build())
      .add(testJson.clazz('MatchingClass2', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('SomeInterface', 'interface')
        .accessingField('com.tngtech.SomeClass1', 'startMethod()', 'targetField')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = [
      'com.tngtech.SomeClass1->com.tngtech.MatchingClass1(methodCall)',
      'com.tngtech.MatchingClass1->com.tngtech.SomeInterface(implements)',
      'com.tngtech.MatchingClass1->com.tngtech.MatchingClass2(constructorCall)',
      'com.tngtech.MatchingClass2->com.tngtech.MatchingClass1(methodCall)',
      'com.tngtech.SomeInterface->com.tngtech.SomeClass1(fieldAccess)'
    ];

    root.nameFilterString = '*Matching*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('should recreate correctly its visible dependencies after setting the node filter: old dependencies are hidden, ' +
    'all new ones are visible but they are not re-instantiated', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('MatchingClass1', 'class')
        .implementing('com.tngtech.SomeInterface')
        .callingConstructor('com.tngtech.MatchingClass2', 'startMethod()', '<init>()')
        .build())
      .add(testJson.clazz('MatchingClass2', 'class')
        .callingMethod('com.tngtech.MatchingClass1', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.clazz('SomeInterface', 'interface')
        .accessingField('com.tngtech.SomeClass1', 'startMethod()', 'targetField')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();
    dependencies.recreateVisible();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const filterForVisibleDependencies = d => d.from.startsWith('com.tngtech.MatchingClass') && d.to.startsWith('com.tngtech.MatchingClass');
    const hiddenDependencies = dependencies.getVisible().filter(d => !filterForVisibleDependencies(d));
    const visibleDependencies = dependencies.getVisible().filter(filterForVisibleDependencies);

    root.nameFilterString = '*Matching*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() => {
      expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
      expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
      expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);
      expect(dependencies.getVisible()).to.include.members(visibleDependencies);
    });
  });

  it('updates on node filtering whether they must share one of the end nodes', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('ClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('InnerClass', 'class')
          .callingConstructor('com.tngtech.SomeClass', '<init>()', '<init>()')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.ClassWithInnerClass', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    //fold the class with the inner class, so that the two dependencies must share their nodes
    dependencies.updateOnNodeFolded('com.tngtech.ClassWithInnerClass', true);

    root.nameFilterString = '~*InnerClass*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    const mapToMustShareNodes = dependencies => dependencies.map(d => d.visualData.mustShareNodes);

    return root._updatePromise.then(() =>
      expect(mapToMustShareNodes(dependencies.getVisible())).to.not.include(true));
  });

  it('updates on resetting the node filter whether they must share one of the end nodes', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('ClassWithInnerClass', 'class')
        .havingInnerClass(testJson.clazz('InnerClass', 'class')
          .callingConstructor('com.tngtech.SomeClass', '<init>()', '<init>()')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.ClassWithInnerClass', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    //fold the class with the inner class, so that the two dependencies must share their nodes
    dependencies.updateOnNodeFolded('com.tngtech.ClassWithInnerClass', true);

    root.nameFilterString = '~*InnerClass*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    const mapToMustShareNodes = dependencies => dependencies.map(d => d.visualData.mustShareNodes);
    return root._updatePromise.then(() =>
      expect(mapToMustShareNodes(dependencies.getVisible())).to.not.include(false));
  });

  it('can do this: fold pkg -> node filter, so that a dependency of the folded package is removed when the ' +
    'original end node of the dependency (which is hidden because of folding) is hidden through the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .callingMethod('com.tngtech.SomeInterface', 'startMethod()', 'targetMethod')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.pkgToFold.MatchingClassX', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.pkgToFold->com.tngtech.SomeInterface()'];

    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);
    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: fold class -> node filter, so that a dependency of the folded class is changed when the ' +
    'dependency of its inner class (which is hidden through the filter) was merged with its own dependency', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();
    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements)'];

    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);
    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: fold pkg -> node filter -> reset node filter, so that a dependency of the folded package is ' +
    'shown again when the original end node of the dependency (which is hidden because of folding) is shown again ' +
    'through resetting the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .callingMethod('com.tngtech.SomeInterface', 'startMethod()', 'targetMethod')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .add(testJson.clazz('SomeClass', 'class')
        .callingMethod('com.tngtech.pkgToFold.MatchingClassX', 'startMethod()', 'targetMethod()')
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();
    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.pkgToFold->com.tngtech.SomeInterface()',
      'com.tngtech.SomeClass->com.tngtech.pkgToFold()'];

    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);
    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: fold class -> node filter -> reset node filter, so that can a dependency of the folded class ' +
    'is changed when the dependency of its inner class (which is shown again through resetting the filter) ' +
    'was merged with its own dependency', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();
    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements childrenAccess)'];

    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);
    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: fold pkg -> node filter -> unfold pkg, so that the unfolding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface')
        .callingMethod('com.tngtech.pkgToFold.NotMatchingClass', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeInterface->com.tngtech.pkgToFold.NotMatchingClass(methodCall)'];

    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', false);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: fold class -> node filter -> unfold class, so that the unfolding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .havingInnerClass(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements)'];

    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);
    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', false);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: filter -> fold pkg, so that folding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface')
        .callingMethod('com.tngtech.pkgToFold.NotMatchingClass', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeInterface->com.tngtech.pkgToFold()'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: filter -> fold class, so that folding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .havingInnerClass(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements)'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: filter -> fold pkg -> unfold pkg, so that unfolding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface')
        .callingMethod('com.tngtech.pkgToFold.NotMatchingClass', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeInterface->com.tngtech.pkgToFold.NotMatchingClass(methodCall)'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);
    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', false);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: filter -> fold class -> unfolding class, so that unfolding does not affect the filter', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .havingInnerClass(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements)'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);
    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', false);

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });


  it('can do this: node filter -> fold pkg -> reset node filter, so that the fold state is not changed', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface')
        .callingMethod('com.tngtech.pkgToFold.NotMatchingClass', 'startMethod()', 'targetMethod()')
        .build())
      .add(testJson.package('pkgToFold')
        .add(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .add(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeInterface->com.tngtech.pkgToFold()',
      'com.tngtech.pkgToFold->com.tngtech.SomeInterface()'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.pkgToFold', true);
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  it('can do this: node filter -> fold class -> reset node filter, so that the fold state is not changed', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClassWithInnerClass', 'class')
        .implementing('com.tngtech.SomeInterface')
        .havingInnerClass(testJson.clazz('MatchingClassX', 'class')
          .implementing('com.tngtech.SomeInterface')
          .build())
        .havingInnerClass(testJson.clazz('NotMatchingClass', 'class').build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    root.addListener(dependencies.createListener());
    root.getLinks = () => dependencies.getAllLinks();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(root.filterGroup)
      .addFilterGroup(dependencies.filterGroup)
      .build();
    root.filterGroup.getFilter('typeAndName').addDependentFilterKey('dependencies.nodeTypeAndName');
    root.filterGroup.getFilter('combinedFilter').addDependentFilterKey('dependencies.visibleNodes');

    const exp = ['com.tngtech.SomeClassWithInnerClass->com.tngtech.SomeInterface(implements childrenAccess)'];

    root.nameFilterString = '~*X*';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');
    dependencies.updateOnNodeFolded('com.tngtech.SomeClassWithInnerClass', true);
    root.nameFilterString = '';
    updateFilterAndRelayout(root, filterCollection, 'nodes.name');

    return root._updatePromise.then(() =>
      expect(dependencies.getVisible()).to.haveDependencyStrings(exp));
  });

  const jsonRootWithAllDependencies = testJson.package('com.tngtech')
    .add(testJson.clazz('SomeInterface', 'interface').build())
    .add(testJson.clazz('SomeClass1', 'class')
      .extending('com.tngtech.SomeClass2')
      .callingConstructor('com.tngtech.SomeClass2', '<init>()', '<init>()')
      .callingMethod('com.tngtech.SomeClass2', 'startMethod()', 'targetMethod()')
      .build())
    .add(testJson.clazz('SomeClass2', 'class')
      .implementing('com.tngtech.SomeInterface')
      .accessingField('com.tngtech.SomeInterface', 'startMethod()', 'targetField')
      .implementingAnonymous('com.tngtech.SomeInterface')
      .havingInnerClass(testJson.clazz('SomeInnerClass', 'class')
        .callingMethod('com.tngtech.SomeClass2', 'startMethod()', 'targetMethod()')
        .build())
      .build())
    .build();

  it('should recreate correctly its visible dependencies after filtering by type (only show implementing an interface):' +
    ' old dependencies are hidden, all new ones are visible but they are not re-instantiated', () => {
    const root = new Root(jsonRootWithAllDependencies, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRootWithAllDependencies, root);
    dependencies.recreateVisible();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    const filter = d1 => dependencies._elementary.filter(
      d2 =>
        d1.from === d2.from &&
        d1.to === d2.to &&
        d2.description.typeName === 'implements').length > 0;
    const visibleDependencies = dependencies.getVisible().filter(filter);
    const hiddenDependencies = dependencies.getVisible().filter(d => !filter(d));

    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: false,
      showConstructorCall: false,
      showMethodCall: false,
      showFieldAccess: false,
      showAnonymousImplementation: false,
      showDepsBetweenChildAndParent: true
    });
    filterCollection.updateFilter('dependencies.type');


    expect(dependencies.getVisible().map(d => d.isVisible())).to.not.include(false);
    expect(dependencies.getVisible().map(d => d._view.isVisible)).to.not.include(false);
    expect(hiddenDependencies.map(d => d.isVisible())).to.not.include(true);
    expect(hiddenDependencies.map(d => d._view.isVisible)).to.not.include(true);
    expect(dependencies.getVisible()).to.include.members(visibleDependencies);
  });

  it('can filter by type: only show inheritance-dependencies', () => {
    const root = new Root(jsonRootWithAllDependencies, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRootWithAllDependencies, root);

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    const exp = [
      'com.tngtech.SomeClass1->com.tngtech.SomeClass2(extends)',
      'com.tngtech.SomeClass2->com.tngtech.SomeInterface(implements)'
    ];

    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: true,
      showConstructorCall: false,
      showMethodCall: false,
      showFieldAccess: false,
      showAnonymousImplementation: false,
      showDepsBetweenChildAndParent: true
    });
    filterCollection.updateFilter('dependencies.type');

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can filter by type: show no dependencies between a class and its inner classes', () => {
    const jsonRoot = testJson.package('com.tngtech.archunit')
      .add(testJson.clazz('Class1', 'class')
        .havingInnerClass(
          testJson.clazz('InnerClass1', 'class')
            .havingInnerClass(testJson.clazz('InnerInnerClass1', 'class').build())
            .havingInnerClass(testJson.clazz('InnerInnerClass2', 'class')
              .accessingField('com.tngtech.archunit.Class1', 'startMethod()', 'targetField')
              .accessingField('com.tngtech.archunit.Class1$InnerClass1$InnerInnerClass1', 'startMethod()', 'targetField').build())
            .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    const exp = ['com.tngtech.archunit.Class1$InnerClass1$InnerInnerClass2->com.tngtech.archunit.Class1$InnerClass1$InnerInnerClass1(fieldAccess)'];

    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: true,
      showConstructorCall: true,
      showMethodCall: true,
      showFieldAccess: true,
      showAnonymousImplementation: true,
      showDepsBetweenChildAndParent: false
    });
    filterCollection.updateFilter('dependencies.type');

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can reset the filter by type: show all dependencies again', () => {
    const root = new Root(jsonRootWithAllDependencies, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRootWithAllDependencies, root);
    dependencies.recreateVisible();

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    const exp = dependencies.getVisible().map(d => d.toString());

    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: true,
      showConstructorCall: false,
      showMethodCall: false,
      showFieldAccess: false,
      showAnonymousImplementation: false,
      showDependenciesBetweenClassAndItsInnerClasses: true
    });
    filterCollection.updateFilter('dependencies.type');
    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: true,
      showConstructorCall: true,
      showMethodCall: true,
      showFieldAccess: true,
      showAnonymousImplementation: true,
      showDependenciesBetweenClassAndItsInnerClasses: true
    });
    filterCollection.updateFilter('dependencies.type');

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('creates the correct detailed dependencies of a class without children to another class: all grouped elementary ' +
    'dependencies are listed, inheritance-dependencies are ignored', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeInterface', 'interface').build())
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetMethod(arg)')
        .accessingField('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetField')
        .callingConstructor('com.tngtech.SomeClass2', '<init>()', '<init>()')
        .extending('com.tngtech.SomeClass2')
        .implementing('com.tngtech.SomeInterface')
        .build())
      .add(testJson.clazz('SomeClass2', 'class').build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      {
        description: 'startMethod(arg)->targetMethod(arg)',
        cssClass: 'dependency methodCall'
      },
      {
        description: 'startMethod(arg)->targetField',
        cssClass: 'dependency fieldAccess'
      },
      {
        description: '<init>()-><init>()',
        cssClass: 'dependency constructorCall'
      }
    ];

    const act = dependencies.getDetailedDependenciesOf('com.tngtech.SomeClass1', 'com.tngtech.SomeClass2');
    expect(act).to.deep.equal(exp);
  });

  it('creates the correct detailed dependencies of a class with an inner class to another class: ' +
    'all grouped elementary dependencies are listed, but the dependencies of the inner classes are ignored', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetMethod(arg)')
        .havingInnerClass(testJson.clazz('SomeInnerClass', 'class')
          .callingMethod('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetMethod(arg)')
          .build())
        .build())
      .add(testJson.clazz('SomeClass2', 'class').build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      {
        description: 'startMethod(arg)->targetMethod(arg)',
        cssClass: 'dependency methodCall'
      }
    ];

    const act = dependencies.getDetailedDependenciesOf('com.tngtech.SomeClass1', 'com.tngtech.SomeClass2');
    expect(act).to.deep.equal(exp);
  });

  it('creates the correct detailed dependencies of a folded class with an inner class to another class: ' +
    'all grouped elementary dependencies, included the ones of the inner class, are listed', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass1', 'class')
        .callingMethod('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetMethod(arg)')
        .havingInnerClass(testJson.clazz('SomeInnerClass', 'class')
          .callingMethod('com.tngtech.SomeClass2', 'startMethod(arg)', 'targetMethod(arg)')
          .build())
        .build())
      .add(testJson.clazz('SomeClass2', 'class').build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    root.getLinks = () => [];
    const dependencies = new Dependencies(jsonRoot, root);

    const exp = [
      {
        description: 'startMethod(arg)->targetMethod(arg)',
        cssClass: 'dependency methodCall'
      },
      {
        description: 'SomeInnerClass.startMethod(arg)->targetMethod(arg)',
        cssClass: 'dependency methodCall'
      }
    ];

    root.getByName('com.tngtech.SomeClass1')._changeFoldIfInnerNodeAndRelayout();
    dependencies.updateOnNodeFolded('com.tngtech.SomeClass1', true);

    const act = dependencies.getDetailedDependenciesOf('com.tngtech.SomeClass1', 'com.tngtech.SomeClass2');
    expect(act).to.deep.equal(exp);
  });

  it('create correct links, which are used for the layout of the nodes', () => {
    const jsonRoot = testJson.package('com.tngtech')
      .add(testJson.clazz('SomeClass', 'class').build())
      .add(testJson.package('pkg1')
        .add(testJson.package('subpkg')
          .add(testJson.clazz('SomeClass', 'class')
            .callingMethod('com.tngtech.pkg2.subpkg.SomeClass', 'startMethod()', 'targetMethod')
            .build())
          .build())
        .build())
      .add(testJson.package('pkg2')
        .add(testJson.package('subpkg')
          .add(testJson.clazz('SomeClass', 'class')
            .callingMethod('com.tngtech.SomeClass', 'startMethod', 'targetMethod()')
            .havingInnerClass(testJson.clazz('SomeInnerClass', 'class')
              .callingMethod('com.tngtech.pkg2.subpkg.SomeClass', 'startMethod()', 'targetMethod()')
              .build())
            .build())
          .build())
        .build())
      .build();
    const root = new Root(jsonRoot, null, () => Promise.resolve());
    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.recreateVisible();

    const exp = [
      {
        'source': 'com.tngtech.pkg1',
        'target': 'com.tngtech.pkg2'
      },
      {
        'source': 'com.tngtech.pkg1.subpkg',
        'target': 'com.tngtech.pkg2.subpkg'
      },
      {
        'source': 'com.tngtech.pkg1.subpkg.SomeClass',
        'target': 'com.tngtech.pkg2.subpkg.SomeClass'
      },
      {
        'source': 'com.tngtech.SomeClass',
        'target': 'com.tngtech.pkg2'
      },
      {
        'source': 'com.tngtech.SomeClass',
        'target': 'com.tngtech.pkg2.subpkg'
      },
      {
        'source': 'com.tngtech.SomeClass',
        'target': 'com.tngtech.pkg2.subpkg.SomeClass'
      },
      {
        'source': 'com.tngtech.pkg2.subpkg.SomeClass$SomeInnerClass',
        'target': 'com.tngtech.pkg2.subpkg.SomeClass',
      }
    ];
    const act = dependencies.getAllLinks();

    expect(act).to.deep.equal(exp);
  });

  it('can show a violation: all dependencies of the violation are marked', () => {
    const rule = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);
    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    expect(dependencies.getVisible().filter(d => d.from === 'com.tngtech.SomeClass1')[0].isViolation).to.be.true;
    expect(dependencies.getVisible().filter(d => d.from === 'com.tngtech.SomeClass2')[0].isViolation).to.be.false;
  });

  it('can hide a violation again: the corresponding dependencies are unmarked', () => {
    const rule = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    dependencies.hideViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    expect(dependencies.getVisible().map(d => d.isViolation)).to.not.include(true);
  });

  it('does not unmark a dependency on hiding a violation of this dependency is part of another violation ' +
    '(which is not hidden)', () => {
    const rule1 = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const rule2 = {
      rule: 'rule2',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule1);
    filterCollection.updateFilter('dependencies.violations');

    dependencies.showViolations(rule2);
    filterCollection.updateFilter('dependencies.violations');

    dependencies.hideViolations(rule1);
    filterCollection.updateFilter('dependencies.violations');

    expect(dependencies.getVisible().filter(d => d.from === 'com.tngtech.SomeClass1')[0].isViolation).to.be.true;
    expect(dependencies.getVisible().filter(d => d.from === 'com.tngtech.SomeClass2')[0].isViolation).to.be.false;
  });

  it('shows all dependencies again when the last violation-rule is hidden again', () => {
    const rule = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);

    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    filterCollection.getFilter('dependencies.violations').filterPrecondition.filterIsEnabled = true;
    filterCollection.updateFilter('dependencies.violations');

    dependencies.hideViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    const exp = ['com.tngtech.SomeClass1->com.tngtech.SomeClass2(fieldAccess)',
      'com.tngtech.SomeClass2->com.tngtech.SomeClass1(fieldAccess)'];

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can hide all dependencies that are not part of a violation when a violation is shown', () => {
    const rule = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);
    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);
    filterCollection.updateFilter('dependencies.violations');
    filterCollection.getFilter('dependencies.violations').filterPrecondition.filterIsEnabled = true;
    filterCollection.updateFilter('dependencies.violations');

    const exp = ['com.tngtech.SomeClass1->com.tngtech.SomeClass2(fieldAccess)'];

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can show all dependencies, also those that are not part of a violation, again', () => {
    const rule = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };
    const dependencies = new Dependencies(jsonRootWithTwoClassesAndTwoDeps, rootWithTwoClassesAndTwoDeps);
    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);
    filterCollection.updateFilter('dependencies.violations');

    filterCollection.getFilter('dependencies.violations').filterPrecondition.filterIsEnabled = true;
    filterCollection.updateFilter('dependencies.violations');

    filterCollection.getFilter('dependencies.violations').filterPrecondition.filterIsEnabled = false;
    filterCollection.updateFilter('dependencies.violations');

    const exp = ['com.tngtech.SomeClass1->com.tngtech.SomeClass2(fieldAccess)',
      'com.tngtech.SomeClass2->com.tngtech.SomeClass1(fieldAccess)'];

    expect(dependencies.getVisible()).to.haveDependencyStrings(exp);
  });

  it('can return all node-fullnames containing violations', () => {
    const jsonRoot =
      testJson.package('com.tngtech')
        .add(testJson.package('pkg1')
          .add(testJson.package('pkg2')
            .add(testJson.package('pkg3')
              .add(testJson.clazz('SomeClass2', 'class')
                .extending('com.tngtech.pkg1.pkg2.SomeClass1')
                .build())
              .build())
            .add(testJson.clazz('SomeClass1', 'class').build())
            .build())
          .build())
        .add(testJson.clazz('SomeClass1', 'class')
          .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField')
          .build())
        .add(testJson.clazz('SomeClass2', 'class').build())
        .build();

    const root = new Root(jsonRoot, null, () => Promise.resolve());

    const rule1 = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };

    const rule2 = {
      rule: 'rule2',
      violations: [{
        origin: 'com.tngtech.pkg1.pkg2.pkg3.SomeClass2',
        target: 'com.tngtech.pkg1.pkg2.SomeClass1'
      }]
    };

    const dependencies = new Dependencies(jsonRoot, root);
    dependencies.showViolations(rule1);
    dependencies.showViolations(rule2);

    const exp = ['com.tngtech', 'com.tngtech.pkg1.pkg2'];

    expect(dependencies.getNodesContainingViolations()).to.containExactlyNodes(exp);
  });

  it('can return a set of all nodes that are involved in violations when these nodes are classes only', () => {
    const jsonRoot =
      testJson.package('com.tngtech')
        .add(testJson.package('pkg1')
          .add(testJson.package('pkg2')
            .add(testJson.clazz('SomeClass2', 'class')
              .extending('com.tngtech.pkg1.pkg2.SomeClass1')
              .build())
            .add(testJson.clazz('SomeClass1', 'class').build())
            .build())
          .build())
        .add(testJson.clazz('SomeClass1', 'class').build())
        .add(testJson.clazz('SomeClass2', 'class').build())
        .build();

    const root = new Root(jsonRoot, null, () => Promise.resolve());

    const rule = {
      rule: 'rule',
      violations: [{
        origin: 'com.tngtech.pkg1.pkg2.SomeClass2',
        target: 'com.tngtech.pkg1.pkg2.SomeClass1'
      }]
    };

    const dependencies = new Dependencies(jsonRoot, root);
    buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);

    const exp = ['com.tngtech.pkg1.pkg2.SomeClass2', 'com.tngtech.pkg1.pkg2.SomeClass1'];

    expect([...dependencies.getNodesInvolvedInVisibleViolations()]).to.containExactlyNodes(exp);
  });

  it('can return a set of all nodes that a involved in violations when these nodes contain packages', () => {
    const jsonRoot =
      testJson.package('com.tngtech')
        .add(testJson.package('pkg')
          .add(testJson.clazz('SomeClass', 'class')
            .extending('com.tngtech.SomeClass1')
            .build())
          .build())
        .add(testJson.clazz('SomeClass1', 'class').build())
        .add(testJson.clazz('SomeClass2', 'class').build())
        .build();

    const root = new Root(jsonRoot, null, () => Promise.resolve());

    const rule = {
      rule: 'rule',
      violations: [{
        origin: 'com.tngtech.pkg.SomeClass',
        target: 'com.tngtech.SomeClass1'
      }]
    };

    const dependencies = new Dependencies(jsonRoot, root);
    buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule);

    root.getByName('com.tngtech.pkg').fold();

    const exp = ['com.tngtech.pkg.SomeClass', 'com.tngtech.SomeClass1'];

    expect([...dependencies.getNodesInvolvedInVisibleViolations()]).to.containExactlyNodes(exp);
  });

  it('does not return node-fullnames of violations that are hidden by a filter', () => {
    const jsonRoot =
      testJson.package('com.tngtech')
        .add(testJson.clazz('SomeClass1', 'class')
          .accessingField('com.tngtech.SomeClass2', 'startMethod()', 'targetField')
          .build())
        .add(testJson.clazz('SomeClass2', 'class').build())
        .build();

    const root = new Root(jsonRoot, null, () => Promise.resolve());

    const rule1 = {
      rule: 'rule1',
      violations: [{
        origin: 'com.tngtech.SomeClass1.startMethod()',
        target: 'com.tngtech.SomeClass2.targetField'
      }]
    };

    const dependencies = new Dependencies(jsonRoot, root);
    const filterCollection = buildFilterCollection()
      .addFilterGroup(dependencies.filterGroup)
      .build();

    dependencies.showViolations(rule1);

    dependencies.changeTypeFilter({
      showImplementing: true,
      showExtending: true,
      showConstructorCall: true,
      showMethodCall: true,
      showFieldAccess: false,
      showAnonymousImplementation: true,
      showDepsBetweenChildAndParent: true
    });
    filterCollection.updateFilter('dependencies.type');

    expect(dependencies.getNodesContainingViolations()).to.containExactlyNodes([]);
  });
});