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
package com.tngtech.archunit.core.domain;

import com.google.common.base.MoreObjects;
import com.google.common.collect.ComparisonChain;
import com.google.common.collect.ImmutableMap;
import com.tngtech.archunit.PublicAPI;
import com.tngtech.archunit.base.ChainableFunction;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.base.HasDescription;
import com.tngtech.archunit.core.Convertible;
import com.tngtech.archunit.core.domain.properties.HasName;

import java.util.*;

import static com.google.common.base.Preconditions.checkNotNull;
import static com.tngtech.archunit.PublicAPI.Usage.ACCESS;
import static com.tngtech.archunit.core.domain.Formatters.formatLocation;
import static java.util.Collections.singleton;

/**
 * Represents a dependency of one Java class on another Java class. Such a dependency can occur by either of the
 * following:
 * <ul>
 * <li>a class accesses a field of another class</li>
 * <li>a class calls a method of another class</li>
 * <li>a class calls a constructor of another class</li>
 * <li>a class inherits from another class (which is in fact a special case of constructor call)</li>
 * <li>a class implements an interface</li>
 * <li>a class has a field with type of another class</li>
 * <li>a class has a method/constructor with parameter/return type of another class</li>
 * </ul>
 */
public class Dependency implements HasDescription, Comparable<Dependency>, Convertible {
    private final Type type;
    private final JavaClass originClass;
    private final JavaClass targetClass;
    private final int lineNumber;
    private final String description;

    private Dependency(Type type, JavaClass originClass, JavaClass targetClass, int lineNumber, String description) {
        this.type = checkNotNull(type);
        this.originClass = checkNotNull(originClass);
        this.targetClass = checkNotNull(targetClass);
        this.lineNumber = lineNumber;
        this.description = checkNotNull(description);
    }

    static Dependency from(JavaAccess<?> access) {
        return new Dependency.FromAccess(access);
    }

    static Dependency fromInheritance(JavaClass origin, JavaClass targetSuperType) {
        String originType = origin.isInterface() ? "Interface" : "Class";
        String originDescription = originType + " " + bracketFormat(origin.getName());

        String dependencyType = !origin.isInterface() && targetSuperType.isInterface() ? "implements" : "extends";

        String targetType = targetSuperType.isInterface() ? "interface" : "class";
        String targetDescription = bracketFormat(targetSuperType.getName());

        String dependencyDescription = originDescription + " " + dependencyType + " " + targetType + " " + targetDescription;

        String description = dependencyDescription + " in " + formatLocation(origin, 0);
        return new Dependency(Type.INHERITANCE, origin, targetSuperType, 0, description);
    }

    static Dependency fromField(JavaField field) {
        return createDependencyFromJavaMember(Type.FIELD_TYPE, "Field", field, "has type", field.getType());
    }

    static Dependency fromReturnType(JavaMethod method) {
        return createDependencyFromJavaMember(Type.METHOD_RETURN_TYPE, "Method", method, "has return type", method.getReturnType());
    }

    static Dependency fromParameter(JavaMethod method, JavaClass parameter) {
        return createDependencyFromJavaMember(Type.METHOD_PARAMETER_TYPE, "Method", method, "has parameter of type", parameter);
    }

    static Dependency fromParameter(JavaConstructor constructor, JavaClass parameter) {
        return createDependencyFromJavaMember(Type.CONSTRUCTOR_PARAMETER_TYPE, "Constructor", constructor, "has parameter of type", parameter);
    }

    private static Dependency createDependencyFromJavaMember(
            Type dependencyType,
            String memberType,
            JavaMember origin,
            String dependencyTypeDescription,
            JavaClass target) {
        String originDescription = memberType + " " + bracketFormat(origin.getFullName());
        String targetDescription = bracketFormat(target.getName());
        String dependencyDescription = originDescription + " " + dependencyTypeDescription + " " + targetDescription;
        String description = dependencyDescription + " in " + formatLocation(origin.getOwner(), 0);
        return new Dependency(dependencyType, origin.getOwner(), target, 0, description);
    }

    private static String bracketFormat(String name) {
        return "<" + name + ">";
    }

    @PublicAPI(usage = ACCESS)
    public Type getType() {
        return type;
    }

    @PublicAPI(usage = ACCESS)
    public int getLineNumber() {
        return lineNumber;
    }

    @PublicAPI(usage = ACCESS)
    public JavaClass getOriginClass() {
        return originClass;
    }

    @PublicAPI(usage = ACCESS)
    public JavaClass getTargetClass() {
        return targetClass;
    }

    @Override
    @PublicAPI(usage = ACCESS)
    public String getDescription() {
        return description;
    }

    @Override
    @PublicAPI(usage = ACCESS)
    public <T> Set<T> convertTo(Class<T> type) {
        return Collections.emptySet();
    }

    @Override
    @PublicAPI(usage = ACCESS)
    public int compareTo(Dependency o) {
        return ComparisonChain.start()
                .compare(lineNumber, o.lineNumber)
                .compare(getDescription(), o.getDescription())
                .result();
    }

    @Override
    public int hashCode() {
        return Objects.hash(originClass, targetClass, lineNumber, description);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        final Dependency other = (Dependency) obj;
        return Objects.equals(this.originClass, other.originClass)
                && Objects.equals(this.targetClass, other.targetClass)
                && Objects.equals(this.lineNumber, other.lineNumber)
                && Objects.equals(this.description, other.description);
    }

    @Override
    public String toString() {
        return MoreObjects.toStringHelper(this)
                .add("originClass", originClass)
                .add("targetClass", targetClass)
                .add("lineNumber", lineNumber)
                .add("description", description)
                .toString();
    }

    @PublicAPI(usage = ACCESS)
    public static JavaClasses toTargetClasses(Iterable<Dependency> dependencies) {
        Set<JavaClass> classes = new HashSet<>();
        for (Dependency dependency : dependencies) {
            classes.add(dependency.getTargetClass());
        }
        return JavaClasses.of(classes);
    }

    /**
     * Represents the type of a {@link Dependency}. This can be used by clients to distinguish cases with different
     * causes for a dependency, e.g. is it a field access or implementing an interface, ...
     */
    public enum Type {
        /**
         * The dependency originates from a {@link JavaCodeUnit} calling a {@link JavaConstructor} of another {@link JavaClass}.
         */
        @PublicAPI(usage = ACCESS)
        CONSTRUCTOR_CALL,
        /**
         * The dependency originates from a {@link JavaClass} declaring a {@link JavaConstructor} with another {@link JavaClass}
         * as one of its parameter types.
         */
        @PublicAPI(usage = ACCESS)
        CONSTRUCTOR_PARAMETER_TYPE,
        /**
         * The dependency originates from a {@link JavaCodeUnit} accessing a {@link JavaField} of another {@link JavaClass}.
         */
        @PublicAPI(usage = ACCESS)
        FIELD_ACCESS,
        /**
         * The dependency originates from a {@link JavaClass} declaring a {@link JavaField} with another {@link JavaClass} as its type.
         */
        @PublicAPI(usage = ACCESS)
        FIELD_TYPE,
        /**
         * The dependency originates from a {@link JavaClass} either extending another {@link JavaClass} or
         * implementing another {@link JavaClass}.
         */
        @PublicAPI(usage = ACCESS)
        INHERITANCE,
        /**
         * The dependency originates from a {@link JavaCodeUnit} calling a {@link JavaMethod} of another {@link JavaClass}.
         */
        @PublicAPI(usage = ACCESS)
        METHOD_CALL,
        /**
         * The dependency originates from a {@link JavaClass} declaring a {@link JavaMethod} with another {@link JavaClass}
         * as one of its parameter types.
         */
        @PublicAPI(usage = ACCESS)
        METHOD_PARAMETER_TYPE,
        /**
         * The dependency originates from a {@link JavaClass} declaring a {@link JavaMethod} with another {@link JavaClass}
         * as its return type.
         */
        @PublicAPI(usage = ACCESS)
        METHOD_RETURN_TYPE
    }

    public static final class Predicates {
        private Predicates() {
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependency(Class<?> originClass, Class<?> targetClass) {
            return dependencyOrigin(originClass).and(dependencyTarget(targetClass))
                    .as("dependency %s -> %s", originClass.getName(), targetClass.getName());
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependency(String originClassName, String targetClassName) {
            return dependencyOrigin(originClassName).and(dependencyTarget(targetClassName))
                    .as("dependency %s -> %s", originClassName, targetClassName);
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependency(DescribedPredicate<? super JavaClass> originPredicate,
                DescribedPredicate<? super JavaClass> targetPredicate) {
            return dependencyOrigin(originPredicate).and(dependencyTarget(targetPredicate))
                    .as("dependency %s -> %s", originPredicate.getDescription(), targetPredicate.getDescription());
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyOrigin(Class<?> clazz) {
            return dependencyOrigin(clazz.getName());
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyOrigin(String className) {
            return dependencyOrigin(HasName.Predicates.name(className).as(className));
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyOrigin(final DescribedPredicate<? super JavaClass> predicate) {
            return Functions.GET_ORIGIN_CLASS.is(predicate).as("origin " + predicate.getDescription());
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyTarget(Class<?> clazz) {
            return dependencyTarget(clazz.getName());
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyTarget(String className) {
            return dependencyTarget(HasName.Predicates.name(className).as(className));
        }

        @PublicAPI(usage = ACCESS)
        public static DescribedPredicate<Dependency> dependencyTarget(final DescribedPredicate<? super JavaClass> predicate) {
            return Functions.GET_TARGET_CLASS.is(predicate).as("target " + predicate.getDescription());
        }
    }

    public static final class Functions {
        private Functions() {
        }

        @PublicAPI(usage = ACCESS)
        public static final ChainableFunction<Dependency, JavaClass> GET_ORIGIN_CLASS = new ChainableFunction<Dependency, JavaClass>() {
            @Override
            public JavaClass apply(Dependency input) {
                return input.getOriginClass();
            }
        };

        @PublicAPI(usage = ACCESS)
        public static final ChainableFunction<Dependency, JavaClass> GET_TARGET_CLASS = new ChainableFunction<Dependency, JavaClass>() {
            @Override
            public JavaClass apply(Dependency input) {
                return input.getTargetClass();
            }
        };
    }

    private static class FromAccess extends Dependency {
        private static final Map<Class<? extends JavaAccess<?>>, Type> ACCESS_TYPE_TO_DEPENDENCY_TYPE = ImmutableMap.of(
                JavaFieldAccess.class, Type.FIELD_ACCESS,
                JavaMethodCall.class, Type.METHOD_CALL,
                JavaConstructorCall.class, Type.CONSTRUCTOR_CALL
        );

        private final JavaAccess<?> access;

        FromAccess(JavaAccess<?> access) {
            super(getTypeOf(access), access.getOriginOwner(), access.getTargetOwner(), access.getLineNumber(), access.getDescription());
            this.access = access;
        }

        private static Type getTypeOf(JavaAccess<?> access) {
            return checkNotNull(ACCESS_TYPE_TO_DEPENDENCY_TYPE.get(access.getClass()),
                    "Could not determine dependency type for %s. This is most likely a bug.", access);
        }

        @Override
        @SuppressWarnings("unchecked") // compatibility is explicitly checked
        public <T> Set<T> convertTo(Class<T> type) {
            if (type.isAssignableFrom(access.getClass())) {
                return (Set<T>) singleton(access);
            }
            return super.convertTo(type);
        }

        @Override
        public int hashCode() {
            return Objects.hash(access);
        }

        @Override
        public boolean equals(Object obj) {
            if (this == obj) {
                return true;
            }
            if (obj == null || getClass() != obj.getClass()) {
                return false;
            }
            final FromAccess other = (FromAccess) obj;
            return Objects.equals(this.access, other.access);
        }

        @Override
        public String toString() {
            return getClass().getEnclosingClass().getSimpleName() + "." + super.toString();
        }
    }
}
