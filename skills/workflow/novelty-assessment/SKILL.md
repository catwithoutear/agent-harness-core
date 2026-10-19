---
name: novelty-assessment
description: Use when judging whether a research idea or paper carries a defensible contribution against prior work: novelty challenges, reviewer claims of overlap, related-work framing, and defending or abandoning an innovation claim.
---

# Novelty Assessment

Decide whether a candidate idea carries a defensible contribution, and if it
does, state that contribution in a form a reviewer can check. This skill owns the
judgment. Writing the surrounding paper, proposal, or design document is out of
scope.

## Criteria: apply before any conclusion

1. Novelty and contribution are differential, not absolute. "Nobody has done
   this" is not the bar and earns no credit. Most real contributions build on
   existing work by advancing, correcting, refining, challenging, or
   reorganizing a problem. Similar existing work is not by itself a reason to
   reject an idea.
2. Keep two questions separate. Whether a direction is worth pursuing and
   whether it supports a contribution claim are different judgments. A direction
   can be worth doing with no novelty claim at all (a reproduction, a port, an
   engineering landing), and the value of that work does not substitute for the
   claim.
3. A difference must land in the contribution layer, not the presentation layer.
   A different dataset, different wording, different scale, or a better story is
   not a contribution. Reframing counts only when it changes what can be
   explained, what can be predicted, or which problem becomes solvable.

## Difference strength

Classify every claimed difference into one tier and state the basis:

- **Strong**: a new problem setting, a new mechanism or method, or a new
  theoretical result that explains or predicts something.
- **Moderate**: a new empirical regime (scale, domain, failure condition), or a
  substantive correction or counterexample to an existing method.
- **Weak**: a new combination, or a new evaluation angle.
- **Does not hold**: narrative reframing alone, parameter or dataset
  substitution alone, or an engineering implementation alone.

The weak tier is supporting evidence only. It cannot carry a novelty claim by
itself.

## Survey requirements

1. Find the closest existing work and read its problem setting, core method,
   technical detail, and contribution boundary. Do not judge from titles,
   abstracts, or surface similarity.
2. Stop on saturation: keep reading until a newly read paper stops changing the
   comparison dimensions. Do not state a conclusion before that point. When
   retrieval limits prevent saturation, report the coverage gap explicitly.
3. Report the closest work as a table:
   `work | problem setting | core method | contribution boundary | axis of difference`.
4. Name the single most dangerous work, the one that could subsume the claimed
   contribution, and say why it does not.

## Output

### Novelty claim

When the difference holds, write one paragraph in exactly this form:

> Relative to X (which does Y), we do Z. This matters because W.

Z must sit in the moderate tier or above. W must name a concrete consequence:
what becomes explainable, what becomes solvable, or which failure mode is
removed. "More complete", "more systematic", and "more comprehensive" are not W.

### Verdict

Give exactly one verdict:

- **Holds**: state the claim above, and name the weakest assumption it depends on.
- **Does not hold**: stop arguing, and name which work collides, at which layer
  (problem setting, core method, or main contribution), and why the remaining
  difference cannot support a credible claim.

Both verdicts use the same evidence standard. Do not lower the bar for a
negative verdict because the idea is otherwise attractive, and do not lower it
for a positive verdict because the work looks promising.

## Prohibited

- Manufacturing novelty to keep an idea alive.
- Substituting "worth doing" for "has a contribution".
- Accepting narrative quality as a difference.
- Concluding before the survey reaches saturation.
- Skipping the most dangerous work.
