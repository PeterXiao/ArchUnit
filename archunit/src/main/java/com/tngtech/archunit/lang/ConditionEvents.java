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
package com.tngtech.archunit.lang;

import java.util.Collection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

import com.google.common.collect.ArrayListMultimap;
import com.google.common.collect.ImmutableSet;
import com.google.common.collect.Multimap;
import com.google.common.reflect.TypeToken;
import com.tngtech.archunit.PublicAPI;
import com.tngtech.archunit.core.Convertible;
import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaAccess;

import static com.tngtech.archunit.PublicAPI.State.EXPERIMENTAL;
import static com.tngtech.archunit.PublicAPI.Usage.ACCESS;

public final class ConditionEvents implements Iterable<ConditionEvent> {

    @PublicAPI(usage = ACCESS)
    public ConditionEvents() {
    }

    private final Multimap<Type, ConditionEvent> eventsByViolation = ArrayListMultimap.create();

    @PublicAPI(usage = ACCESS)
    public void add(ConditionEvent event) {
        eventsByViolation.get(Type.from(event.isViolation())).add(event);
    }

    @PublicAPI(usage = ACCESS)
    public Collection<ConditionEvent> getViolating() {
        return eventsByViolation.get(Type.VIOLATION);
    }

    @PublicAPI(usage = ACCESS)
    public Collection<ConditionEvent> getAllowed() {
        return eventsByViolation.get(Type.ALLOWED);
    }

    @PublicAPI(usage = ACCESS)
    public boolean containViolation() {
        return !getViolating().isEmpty();
    }

    @PublicAPI(usage = ACCESS)
    public boolean isEmpty() {
        return getAllowed().isEmpty() && getViolating().isEmpty();
    }

    @PublicAPI(usage = ACCESS)
    public void describeFailuresTo(CollectsLines messages) {
        for (ConditionEvent event : getViolating()) {
            event.describeTo(messages);
        }
    }

    /**
     * Passes violations to the supplied {@link ViolationHandler}. The passed violations will automatically
     * be filtered by the reified type of the given {@link ViolationHandler}. That is, if a
     * <code>ViolationHandler&lt;SomeClass&gt;</code> is passed, only violations by objects assignable to
     * <code>SomeClass</code> will be reported. The term 'reified' means that the type parameter
     * was not erased, i.e. ArchUnit can still determine the actual type parameter of the passed violation handler,
     * otherwise the upper bound, in extreme cases {@link Object}, will be used (i.e. all violations will be passed).<br><br>
     * For any {@link ViolationHandler ViolationHandler&lt;T&gt;} violating objects that are not of type <code>T</code>,
     * but implement {@link Convertible} will be {@link Convertible#convertTo(Class) converted} to <code>T</code>
     * and the result will be passed on to the {@link ViolationHandler}. This makes sense for example for a client
     * who wants to handle {@link Dependency}, but the {@link ConditionEvents} corresponding objects are of type
     * {@link JavaAccess} which does not share any common meaningful type.
     *
     * @param violationHandler The violation handler that is supposed to handle all violations matching the
     *                         respective type parameter
     */
    @PublicAPI(usage = ACCESS, state = EXPERIMENTAL)
    public void handleViolations(ViolationHandler<?> violationHandler) {
        ConditionEvent.Handler eventHandler = convertToEventHandler(violationHandler);
        for (final ConditionEvent event : eventsByViolation.get(Type.VIOLATION)) {
            event.handleWith(eventHandler);
        }
    }

    private <T> ConditionEvent.Handler convertToEventHandler(final ViolationHandler<T> handler) {
        final Class<T> supportedElementType = getHandlerTypeParameter(handler);

        return new ConditionEvent.Handler() {
            @Override
            public void handle(Collection<?> correspondingObjects, String message) {
                Collection<T> collection = getObjectsToHandle(correspondingObjects, supportedElementType);
                if (!collection.isEmpty()) {
                    handler.handle(collection, message);
                }
            }
        };
    }

    @SuppressWarnings("unchecked") // First type parameter of handler is of type T
    private <T> Class<T> getHandlerTypeParameter(ViolationHandler<T> handler) {
        return (Class<T>) TypeToken.of(handler.getClass())
                .resolveType(ViolationHandler.class.getTypeParameters()[0]).getRawType();
    }

    @SuppressWarnings("unchecked") // compatibility asserted via reflection
    private <T> Collection<T> getObjectsToHandle(Collection<?> objects, Class<T> supportedType) {
        Set<T> result = new HashSet<>();
        for (Object object : objects) {
            if (supportedType.isInstance(object)) {
                result.add((T) object);
            } else if (object instanceof Convertible) {
                result.addAll(((Convertible) object).convertTo(supportedType));
            }
        }
        return result;
    }

    @Override
    @PublicAPI(usage = ACCESS)
    public Iterator<ConditionEvent> iterator() {
        return ImmutableSet.copyOf(eventsByViolation.values()).iterator();
    }

    @Override
    public String toString() {
        return "ConditionEvents{" +
                "Allowed Events: " + getAllowed() +
                "; Violating Events: " + getViolating() +
                '}';
    }

    private enum Type {
        ALLOWED, VIOLATION;

        private static Type from(boolean violation) {
            return violation ? VIOLATION : ALLOWED;
        }
    }
}
