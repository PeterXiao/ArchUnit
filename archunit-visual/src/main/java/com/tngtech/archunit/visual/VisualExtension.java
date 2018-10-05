/*
 * Copyright 2018 TNG Technology Consulting GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.tngtech.archunit.visual;

import java.io.File;
import java.util.Collections;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.tngtech.archunit.PublicAPI;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.EvaluationResult;
import com.tngtech.archunit.lang.extension.ArchUnitExtension;
import com.tngtech.archunit.lang.extension.EvaluatedRule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static com.google.common.collect.Sets.newHashSet;

public class VisualExtension implements ArchUnitExtension {
    private static final Logger LOG = LoggerFactory.getLogger(VisualExtension.class);
    private static final String REPORT_DIR_SYSTEM_PROPERTY = "archunit.visual.report.dir";
    private static final String UNIQUE_IDENTIFIER = "archunit-visual";

    /**
     * using the JavaClasses-references as key
     * (that means, that two evaluated rules of the same classes, but different classes-instances, are not grouped)
     */
    private static ConcurrentHashMap<JavaClasses, Set<EvaluationResult>> evaluatedRules = new ConcurrentHashMap<>();

    private static final File targetDirectory;

    static {
        String configuredReportDir = System.getProperty(REPORT_DIR_SYSTEM_PROPERTY);
        targetDirectory = configuredReportDir == null || configuredReportDir.length() == 0
                ? new File(VisualExtension.class.getResource("/").getFile(), "archunit-report")
                : new File(configuredReportDir);
    }

    @Override
    public String getUniqueIdentifier() {
        return UNIQUE_IDENTIFIER;
    }

    @Override
    public void configure(Properties properties) {
    }

    @Override
    public void handle(EvaluatedRule evaluatedRule) {
        if (evaluatedRules.containsKey(evaluatedRule.getClasses())) {
            evaluatedRules.get(evaluatedRule.getClasses()).add(evaluatedRule.getResult());
        } else {
            evaluatedRules.put(evaluatedRule.getClasses(), Collections.synchronizedSet(
                    newHashSet(evaluatedRule.getResult())));
        }
    }

    @Override
    public void onFinishedAnalyzing(JavaClasses classes) {
        createVisualization(classes);
    }

    /**
     * When not using the ArchUnitRunner, this method should be called after running the archunit-tests,
     * e.g. within an @AfterClass-annotated method, to hand the analyzed classes over
     * and finish the visualization.
     *
     * @param classes the classes that are analyzed by archunit-tests
     */
    @PublicAPI(usage = PublicAPI.Usage.ACCESS)
    public static void createVisualization(JavaClasses classes) {
        LOG.info("Writing report to {}", targetDirectory.getAbsolutePath());
        if (evaluatedRules.containsKey(classes)) {
            new Visualizer(classes, targetDirectory).visualize(evaluatedRules.get(classes));
            evaluatedRules = new ConcurrentHashMap<>();
        } else {
            evaluatedRules = new ConcurrentHashMap<>();
            throw new RuntimeException(classes.getDescription() + " was not part of a test");
        }
    }
}