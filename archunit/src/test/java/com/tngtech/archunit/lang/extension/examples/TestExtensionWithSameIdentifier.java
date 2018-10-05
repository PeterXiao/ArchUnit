package com.tngtech.archunit.lang.extension.examples;

import java.util.Properties;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.extension.ArchUnitExtension;
import com.tngtech.archunit.lang.extension.EvaluatedRule;

public class TestExtensionWithSameIdentifier implements ArchUnitExtension {
    @Override
    public String getUniqueIdentifier() {
        return TestExtension.UNIQUE_IDENTIFIER;
    }

    @Override
    public void configure(Properties properties) {
    }

    @Override
    public void handle(EvaluatedRule evaluatedRule) {
    }

    @Override
    public void onFinished(JavaClasses classes) {
    }
}
