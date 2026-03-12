# Plan: Feature Graph with Events

**Status: PLANNED**

## Problem

Features run sequentially and don't communicate. When transitive analyzer finds
an EOL package, the override tracker doesn't know. When family conflict detector
finds a split, the upgrade sequencer doesn't prioritize resolving it. Information
flows one way: feature → UI.

## Goal

Introduce an event bus that features use to publish discoveries. Other features
subscribe and react in real-time, enabling:

1. **Dynamic scoring adjustments** — Score drops when events reveal new risks
2. **Cross-feature reactions** — Override tracker reacts to transitive findings
3. **Unified problem aggregation** — All events collected into action items

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Event Bus                              │
│  ─────────────────────────────────────────────────────────  │
│  Events: TRANSITIVE_FLAGGED, OVERRIDE_STALE,                │
│          FAMILY_SPLIT, PACKAGE_UNUSED, BLOCKER_DETECTED,    │
│          LICENSE_RISK, SCORE_COMPUTED                       │
└─────────────────────────────────────────────────────────────┘
        ▲           ▲           ▲           ▲
        │ publish   │ publish   │ publish   │ publish
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │Transitive│ │Override │ │ Family  │ │ Unused  │
   │ Analyzer │ │ Tracker │ │Detector │ │Detector │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘

        │ subscribe  │ subscribe  │ subscribe
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Score  │ │ Action  │ │   UI    │
   │Adjuster │ │ Ranker  │ │Aggregator│
   └─────────┘ └─────────┘ └─────────┘
```

## Event Types

```typescript
type InsightEvent =
  | { type: 'TRANSITIVE_FLAGGED'; directDep: string; transitive: string; reason: string }
  | { type: 'OVERRIDE_STALE'; overrideName: string; reason: string }
  | { type: 'OVERRIDE_ACTIVE'; overrideName: string; blocker: string }
  | { type: 'FAMILY_SPLIT'; familyId: string; packages: string[]; suggestion: string }
  | { type: 'PACKAGE_UNUSED'; packageName: string }
  | { type: 'BLOCKER_DETECTED'; blocked: string; blocker: string }
  | { type: 'LICENSE_RISK'; packageName: string; license: string; isTransitive: boolean }
  | { type: 'SCORE_COMPUTED'; packageName: string; score: number; category: string };
```

## How It Works

### Step 1: Event Bus Implementation

Create a simple pub/sub bus:

```typescript
class InsightEventBus {
  private subscribers = new Map<string, Set<EventHandler>>();

  publish(event: InsightEvent): void {
    const handlers = this.subscribers.get(event.type) ?? [];
    for (const handler of handlers) {
      handler(event);
    }
    // Also publish to wildcard subscribers
    const all = this.subscribers.get('*') ?? [];
    for (const handler of all) {
      handler(event);
    }
  }

  subscribe(type: string | '*', handler: EventHandler): Disposable {
    // ...
  }
}
```

### Step 2: Features Publish Events

Modify each feature to emit events when it discovers something:

**Transitive Analyzer**:
```typescript
for (const flagged of flaggedTransitives) {
  eventBus.publish({
    type: 'TRANSITIVE_FLAGGED',
    directDep: flagged.directDep,
    transitive: flagged.name,
    reason: flagged.reason,
  });
}
```

**Override Tracker**:
```typescript
for (const analysis of overrideAnalyses) {
  if (analysis.status === 'stale') {
    eventBus.publish({
      type: 'OVERRIDE_STALE',
      overrideName: analysis.entry.name,
      reason: 'No conflict detected',
    });
  }
}
```

### Step 3: Subscribers React

**Score Adjuster** subscribes to events that affect scoring:

```typescript
eventBus.subscribe('TRANSITIVE_FLAGGED', (event) => {
  const result = results.find(r => r.package.name === event.directDep);
  if (result) {
    result.score = Math.max(0, result.score - 5);
  }
});
```

**Action Ranker** collects all events:

```typescript
eventBus.subscribe('*', (event) => {
  actionItems.push(eventToActionItem(event));
});
```

### Step 4: Event Ordering

Events are processed in phases:

1. **Discovery phase** — Features emit events
2. **Reaction phase** — Subscribers process events
3. **Aggregation phase** — UI collects final state

To ensure deterministic order, use a two-pass approach:

```typescript
// Phase 1: Collect all events
const events: InsightEvent[] = [];
eventBus.subscribe('*', e => events.push(e));

// Run all features...

// Phase 2: Process in defined order
const orderedSubscribers = [scoreAdjuster, actionRanker, uiAggregator];
for (const subscriber of orderedSubscribers) {
  for (const event of events) {
    subscriber.handle(event);
  }
}
```

## Example Flow

1. Scan starts, transitive analyzer runs
2. Finds `http_parser` is EOL, emits `TRANSITIVE_FLAGGED`
3. Score Adjuster receives event, adjusts `http`'s score -5
4. Override Tracker runs, finds active override on `intl`
5. Emits `OVERRIDE_ACTIVE { overrideName: 'intl', blocker: 'http' }`
6. Action Ranker receives both events, links them:
   "Upgrading http may resolve intl override"
7. UI Aggregator builds unified problem view

## Changes

### New File: `src/events/insight-event-bus.ts`

- `InsightEventBus` class with pub/sub
- `InsightEvent` union type
- `EventHandler` type

### New File: `src/events/score-adjuster.ts`

- Subscribes to score-affecting events
- Applies penalties to results

### New File: `src/events/action-ranker.ts`

- Subscribes to all events
- Builds ranked action item list
- Links related events

### New File: `src/events/ui-aggregator.ts`

- Subscribes to all events
- Groups by package
- Prepares data for tree/hover/diagnostics

### Modified: `src/extension-activation.ts`

- Create event bus on activation
- Pass bus to all features
- Run phases in order

### Modified: `src/scoring/transitive-analyzer.ts`

- Accept event bus parameter
- Emit `TRANSITIVE_FLAGGED` events

### Modified: `src/scoring/override-analyzer.ts`

- Accept event bus parameter
- Emit `OVERRIDE_STALE` and `OVERRIDE_ACTIVE` events

### Modified: `src/scoring/family-conflict-detector.ts`

- Accept event bus parameter
- Emit `FAMILY_SPLIT` events

### Modified: `src/scoring/unused-detector.ts`

- Accept event bus parameter
- Emit `PACKAGE_UNUSED` events

### Tests

- `src/test/events/insight-event-bus.test.ts`
  - Publish/subscribe lifecycle
  - Wildcard subscriptions
  - Unsubscribe cleanup
- `src/test/events/score-adjuster.test.ts`
  - Event to score penalty mapping
- `src/test/events/action-ranker.test.ts`
  - Event to action item conversion
  - Related event linking

## Pros

- Features truly interact at runtime
- Clean separation of concerns
- Easy to add new features that react to existing events
- Natural extension point for future features

## Cons

- More complex architecture than consolidator
- Debugging event flows requires tooling
- Order-dependent issues possible
- Higher implementation effort (~4-6 hours)

## Out of Scope

- Persistent event log (events are per-scan only)
- User-visible event stream
- Event replay/debugging UI
