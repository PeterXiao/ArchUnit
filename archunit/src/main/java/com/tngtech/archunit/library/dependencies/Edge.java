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
package com.tngtech.archunit.library.dependencies;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableSet;
import com.tngtech.archunit.core.Convertible;

class Edge<T, ATTACHMENT> implements Convertible {
    private final T from;
    private final T to;
    private final List<ATTACHMENT> attachments = new ArrayList<>();

    Edge(T from, T to) {
        this.from = from;
        this.to = to;
    }

    Edge(T from, T to, Collection<ATTACHMENT> attachments) {
        this(from, to);
        this.attachments.addAll(attachments);
    }

    T getFrom() {
        return from;
    }

    T getTo() {
        return to;
    }

    List<ATTACHMENT> getAttachments() {
        return ImmutableList.copyOf(attachments);
    }

    void addAttachment(ATTACHMENT attachment) {
        attachments.add(attachment);
    }

    @Override
    @SuppressWarnings("unchecked") // compatibility ensured via reflection
    public <S> Set<S> convertTo(Class<S> type) {
        ImmutableSet.Builder<S> result = ImmutableSet.builder();
        for (ATTACHMENT attachment : attachments) {
            if (type.isInstance(attachment)) {
                result.add((S) attachment);
            } else if (attachment instanceof Convertible) {
                result.addAll(((Convertible) attachment).convertTo(type));
            }
        }
        return result.build();
    }

    @Override
    public int hashCode() {
        return Objects.hash(from, to);
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (obj == null || getClass() != obj.getClass()) {
            return false;
        }
        final Edge<?, ?> other = (Edge<?, ?>) obj;
        return Objects.equals(this.from, other.from)
                && Objects.equals(this.to, other.to);
    }

    @Override
    public String toString() {
        return "Edge{" +
                "from=" + from +
                ", to=" + to +
                ", attachments=" + attachments +
                '}';
    }
}
