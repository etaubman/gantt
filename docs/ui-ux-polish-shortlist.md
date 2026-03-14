# UI/UX Polish Shortlist

This is a focused list of small refinements that should make the app feel more finished and more comfortable to use without changing core behavior.

## Top 10 Refinements

1. **Tighten hover and focus states across the whole app**
   Buttons, rows, filters, tabs, and Gantt bars should all respond with a consistent hover/focus treatment. Right now the app has strong styling, but a single shared interaction language would make it feel more intentional and premium.

2. **Make selected state more obvious and more stable**
   The currently selected task should stand out a little more in both the table and timeline, with a clearer persistent highlight that survives nearby visual noise. This would reduce the “where am I?” feeling when scanning dense plans.

3. **Add subtle empty/loading skeleton states in key panels**
   Tooltips, detail tabs, audit views, and exports currently jump between blank and loaded states. Small skeletons or placeholder shimmer blocks would make waits feel deliberate instead of abrupt.

4. **Improve spacing rhythm in dense task rows**
   The table is information-rich, which is good, but a little more consistency in vertical spacing, chip padding, and icon breathing room would make it easier to scan quickly without feeling cramped.

5. **Refine tooltip behavior so it feels calmer**
   The super-tooltips should feel slightly more “sticky” and less twitchy when moving the mouse between nearby targets. A tiny delay/forgiveness zone and more stable positioning would make them feel smoother.

6. **Give filter changes clearer feedback**
   When filters are applied, the UI should make that state more visible with stronger active styling, clearer counts, and a more prominent “filtered view” feel. This helps users understand why certain tasks are or are not visible.

7. **Reduce visual competition in the header**
   The header now has many useful controls, but the actions compete for attention. A small refinement to button hierarchy, spacing, and grouping would make the page feel calmer and make the primary action more obvious.

8. **Polish modal transitions and entry states**
   The detail modal and audit modal would benefit from smoother open/close motion, slightly better backdrop treatment, and more graceful initial content reveal. Small motion polish can make the app feel much more modern.

9. **Improve readability of long-form text content**
   Comments, risk descriptions, audit values, and tooltip text should be easier to skim with better line length, spacing, truncation rules, and “show more” treatment where needed. This would help the app feel less text-heavy without hiding information.

10. **Add a clearer sense of completion and success after actions**
   Saving, adding comments, changing status, exporting, and deleting should all give slightly more polished feedback. Better toast copy, calmer success timing, and small visual confirmation near the affected area would make edits feel more trustworthy.

## Suggested Order

If these are tackled in the most noticeable order:

1. Hover/focus consistency
2. Selected-state clarity
3. Tooltip calmness
4. Header action hierarchy
5. Modal transition polish
6. Filter feedback
7. Dense-row spacing
8. Text readability
9. Loading placeholders
10. Success feedback polish

## Scope Guardrail

These are intentionally UI/UX refinements only:

- No new data model work
- No new backend features
- No major layout redesign
- No technical cleanup items yet

The goal is to make the product feel smoother, calmer, clearer, and more confidence-inspiring right before prime time.
