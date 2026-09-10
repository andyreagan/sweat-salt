# Sweat, salt, and the sodium decision tree

> **What this is.** A working folder, made public. Everything here is the output of a series of
> conversations with Claude (Anthropic's model) about a sweat test I had done and a paper I read
> afterwards: a draft letter, a decision procedure, a few calculators, and two scroll-through
> explainers. None of it is correspondence with anyone, none of it has been submitted anywhere, and
> the letter in `paper/` is a draft under revision, not a manuscript. Treat the numbers as modelling
> from published equations, not as advice.
>
> Live site: **https://andyreagan.github.io/sweat-salt/**

Does the salt in your bottle matter? Sweat is hypotonic to plasma, so plasma sodium
*rises* during exercise unless you replace a large fraction of what you sweat. The
fraction where it stops rising and starts falling depends only on sweat composition:

    f* = 1 − 1.03 ([Na⁺]sweat + [K⁺]sweat) / ([Na⁺]plasma + 23.8)

This repository holds a response to McCubbin AJ, *Sodium intake for athletes before,
during and after exercise* (Performance Nutrition 2025;1:11,
[doi:10.1186/s44410-025-00011-9](https://doi.org/10.1186/s44410-025-00011-9)),
arguing that its Figure 3 decision tree gates on duration and sweat rate as proxies
for f*, and a small simulator that computes the thing directly.

## Layout

| Path | What |
|---|---|
| `site/index.html` | The guided calculator. Asks only what it needs: duration, sweat rate, body mass, then drinking rate, then saltiness only if it matters. Draggable numbers. Plain HTML, system fonts, under 60 lines of CSS. |
| `site/scrollytelling.html` | A scroll-driven walkthrough of the argument (scrollama + d3, loaded from cdnjs): sweat vs blood, the crossover, and the rugby, marathoner and heavy-sweater cases. `#scene=7` opens a scene directly. |
| `site/scrollytelling-flow.html` | The same walkthrough as one continuous animation: a figure of body water coloured by plasma sodium, sweat drops leaving coloured by their own sodium, 500 mL bottles emptying in turn, a running trace, and a smooth recovery between scenes. Ends in a full-width run-your-own with a Go button. |
| `site/full.html` | The full model: every input, three time-series charts, an evidence section. The guided page links into it with the same scenario. |
| `paper/` | The Matters Arising letter (`.tex` source and compiled `.pdf`), submission notes, and the proposed decision-procedure flowchart (Mermaid). Build with `latexmk -pdf`. |
| `references/` | The McCubbin review (open access, CC BY). |
| `images/` | Photos from the chamber sweat test, 3 Sep 2026. Two are kept out of the repo: one shows the lab's contact details, one a work laptop login screen. |
| `archive/` | Earlier drafts of the simulator. |

## Running the simulator

Both pages are single static files with no build step. Any static server works:

    cd site && python3 -m http.server 8000

Inputs are written to the URL fragment, so a link captures a full scenario.

Planned: an advanced page covering pre-exercise hyperhydration and post-exercise
replacement (all of the fluid, and enough of the sodium to make rehydration work).

## Model

Kurtz I, Nguyen MK. A simple quantitative approach to analyzing the generation of
the dysnatremias. Clin Exp Nephrol 2003;7:138–43. As applied to exercise by Baker,
Lang and Kenney (J Appl Physiol 2008) and McCubbin (2025). Assumes no urine output,
no metabolic water, potassium unreplaced, and sodium taken evenly through the event.
Modelling only, not medical advice.
