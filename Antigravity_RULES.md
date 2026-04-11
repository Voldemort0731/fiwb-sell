# Antigravity Coding Rules

Before making any changes, read the entire codebase and map out
every existing feature and the files they touch. Do not modify
any file that is not directly required for the current task.

## Rules (must follow for every change)

1. **SCOPE LOCK** — Only edit files that the current feature absolutely requires. If you are unsure whether a file needs to change, do not change it.

2. **NO COLLATERAL EDITS** — Do not refactor, reformat, rename, or "clean up" any existing code while building the new feature. Even if you see something that looks wrong or inefficient, leave it exactly as it is.

3. **NO IMPORT CHANGES** in existing files unless the new feature explicitly needs a new import in that file. Do not remove or reorder existing imports.

4. **NO STYLE CHANGES** — Do not touch CSS, Tailwind classes, or inline styles in any existing component unless the current task requires it.

5. **NEW CODE GOES IN NEW FILES** wherever possible. If the feature can live in a new component or utility file, put it there and import it into the existing file with the minimum possible change to the existing file.

6. **BEFORE TOUCHING ANY EXISTING FILE** — state out loud which file you are about to modify, what existing functionality it contains, and exactly what line-level change you are making and why it is necessary for the current task.

7. **AFTER COMPLETING THE FEATURE** — list every file you modified and confirm that the only changes in each file are directly related to the current task. Flag anything that could potentially affect existing behavior.

## Pre-Task Checklist

- [ ] Read and acknowledge these rules
- [ ] Map out existing features and the files they touch
- [ ] Identify which files are in scope for the current task
- [ ] Confirm no out-of-scope files will be touched
