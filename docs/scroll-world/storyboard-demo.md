# Scroll journey storyboard: demo story (test run)

A scroll-controlled film for the **Life Story** page. As visitors scroll, one camera glides forward
through five miniature scenes from Margaret's life (the fictional demo celebrant), ending at the
party with the RSVP button.

- **Look:** miniature diorama in navy, emerald and champagne gold
- **Camera:** one continuous forward glide
- **Versions:** desktop (wide 16:9) and phone (tall 9:16)
- **Where you make it:** the Higgsfield website
- **Where the files go:** `scroll-world/raw/` in the project folder (names below)

---

## How the pieces fit

Each clip must **start on the exact last frame of the clip before it**. That is what makes five
clips play as one unbroken camera move. So the clips are made one at a time, in order:

1. You make a clip on Higgsfield and download it.
2. You save it in `scroll-world/raw/` with its name (for example `wide-1.mp4`) and tell Claude.
3. Claude pulls out its last frame and saves it as `scroll-world/frames/wide-1-last.png`.
4. You upload that frame as the **start frame** of the next clip.

The five scene pictures are made first. Picture 1 starts the first clip. All five are also used as
the still images shown while the video loads, and for guests who turn motion off.

---

## Start with a test (recommended)

Before spending on everything, test the process with **scenes 1 and 2, wide only**:

| Step | What | Rough credits |
|---|---|---|
| 1 | Pictures 1 and 2 | ~30 |
| 2 | Wide clip 1 (from picture 1) | ~50 |
| 3 | Wide clip 2 (from clip 1's last frame) | ~50 |
| | **Test total** | **~130** |

If the join between clip 1 and clip 2 looks smooth and you like the look, carry on with the rest.

**Full build estimate:** 5 pictures (~75) + 5 wide clips (~250) + 5 tall clips (~250), plus about
15% for redoing a clip that comes out wrong: **roughly 650–750 credits**. Higgsfield does not show
prices in advance, so check your balance after the test and we'll correct this estimate.

---

## Settings on the Higgsfield website

**Pictures**
- Model: **GPT Image 2** (if it isn't listed, tell Claude which image models you see)
- Aspect ratio: **3:2**
- Quality: **high**, resolution **2K** if offered

**Clips**
- Model: **Seedance 2.0** (standard, not "mini")
- Start frame: the image named in each step
- **No end frame**: leave it empty
- Aspect ratio: **16:9** for wide clips, **9:16** for tall clips
- Resolution: **1080p**
- Length: **8 seconds**
- Sound: **off** if there's a choice (the page plays the video silently)

If Higgsfield refuses a clip for "sensitive content" (this happens with indoor scenes), just try the
same prompt once more. If it refuses again, tell Claude and we'll adjust the wording.

---

## The style text (already inside every picture prompt)

This paragraph is identical in all five picture prompts. Don't change it: the identical wording
is what makes the five scenes look like one world.

```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
```

---

## Scene 1: Childhood in Enugu

**On screen**
- Label: CHILDHOOD · ENUGU, 1956
- Headline: Where the story begins
- Line: A bookshop, a mathematics teacher's home, and a girl who read everything.
- Tags: Bookshop · First books

**Picture 1**: save as `still-1.png`
```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
Subject: a small 1960s West African family bookshop on a quiet red-earth street, a deep veranda with wooden shelves full of books spilling outside, a big mango tree giving shade, a bicycle leaning on the wall, a tiny girl sitting on the veranda steps reading a book, a slate board and chalk on a small table, warm lamplight glowing from the shop doorway.
```

**Wide clip 1**: start frame `still-1.png` · save as `wide-1.mp4`
```
Single continuous cinematic camera move, no cuts. Begin high and a little far, looking at the whole miniature bookshop on its floating island. Slow, steady forward glide down toward the veranda, passing under the branches of the mango tree toward the warm glowing shop doorway and the shelves of books. In the final second, settle back into a slow, steady forward glide toward the open doorway. Soft matte clay miniature diorama, tilt-shift, warm golden light, deep navy, emerald and champagne gold palette. Smooth, graceful, slow motion, subtle parallax. No text, no captions.
```

---

## Scene 2: Medical school in Ibadan

**On screen**
- Label: EDUCATION · IBADAN, 1975
- Headline: A calling to heal
- Line: Medical school, long nights of study, and a promise to care for mothers and children.
- Tags: Medical school · Qualified 1981

**Picture 2**: save as `still-2.png`
```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
Subject: a 1970s university medical school quadrangle with a cream-colored clock tower and a lecture hall with tall arched windows glowing warmly at dusk, a green lawn with footpaths, tiny students in white coats carrying books across the lawn, a bench under a palm tree with a stack of medical textbooks and a stethoscope resting on top.
```

**Wide clip 2**: start frame `frames/wide-1-last.png` (Claude makes this from clip 1) · save as `wide-2.mp4`
```
Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. The camera passes through the warm glow of the doorway and emerges above a university quadrangle at dusk, rising gently as the clock tower and the lecture hall with tall glowing arched windows come into view, then glides across the lawn past tiny students in white coats toward the bench with the stethoscope and textbooks. In the final second, settle back into a slow, steady forward glide toward the lecture hall doors. Soft matte clay miniature diorama, tilt-shift, warm golden light, deep navy, emerald and champagne gold palette. Smooth, graceful, slow motion, subtle parallax. No text, no captions.
```

> **End of the test.** Stop here, tell Claude, and we'll check the join between clip 1 and clip 2
> before going further.

---

## Scene 3: The hospital and the mobile clinic

**On screen**
- Label: CAREER · 1981–2016
- Headline: Thirty-five years of care
- Line: A children's ward in Lagos, and a clinic on wheels that reached villages across three states.
- Tags: Head of paediatrics · 40,000 families

**Picture 3**: save as `still-3.png`
```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
Subject: a small white hospital building with a covered entrance and a garden, and beside it a village clearing where a white mobile clinic van with its side door open is parked under a shady tree, a canopy tent with folding chairs, tiny mothers holding babies waiting in a friendly line, a cool box and neat medical supplies on a table, warm late-afternoon light.
```

**Wide clip 3**: start frame `frames/wide-2-last.png` · save as `wide-3.mp4`
```
Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. The camera glides through the lecture hall doorway into warm light and emerges over a green village clearing beside a small white hospital, tracking low and level alongside a friendly line of tiny waiting mothers toward the white mobile clinic van with its side door open under a shady tree. In the final second, settle back into a slow, steady forward glide past the van toward a path lined with lanterns. Soft matte clay miniature diorama, tilt-shift, warm golden light, deep navy, emerald and champagne gold palette. Smooth, graceful, slow motion, subtle parallax. No text, no captions.
```

---

## Scene 4: Sunday lunch with the family

**On screen**
- Label: FAMILY · EVERY SUNDAY
- Headline: A table with room for everyone
- Line: Three children, five grandchildren, two great-grandchildren, and nobody leaves hungry.
- Tags: Sunday lunch · Five generations of love

**Picture 4**: save as `still-4.png`
```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
Subject: a warm family home with a garden, a long wooden dining table under a vine-covered pergola strung with warm lights, the table set with many plates, large steaming serving pots and bowls of fruit, tiny family members of all ages gathered around it, small children playing on the lawn, flowering bushes and a garden path lined with lanterns leading to the table.
```

**Wide clip 4**: start frame `frames/wide-3-last.png` · save as `wide-4.mp4`
```
Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. The camera follows the lantern-lined path into a family garden at golden hour, sweeping in a slow half-orbit around the long dining table under the pergola strung with warm lights, where tiny family members of all ages are gathered, then continuing past it. In the final second, settle back into a slow, steady forward glide toward the glowing lights beyond the garden. Soft matte clay miniature diorama, tilt-shift, warm golden light, deep navy, emerald and champagne gold palette. Smooth, graceful, slow motion, subtle parallax. No text, no captions.
```

---

## Scene 5: The celebration (ends on RSVP)

**On screen**
- Label: 21 NOVEMBER 2026 · LAGOS
- Headline: Seventy years. One evening.
- Line: Join us in the Emerald Ballroom to celebrate a remarkable life.
- Button: **RSVP** (goes to the RSVP page)

**Picture 5**: save as `still-5.png`
```
Isometric miniature 3D diorama floating as a small rounded island on a plain solid deep navy #071A2B background with a soft warm glow beneath it. Soft matte clay 3D render, finely detailed museum-model miniature, rounded shapes, warm golden lamplight and gentle rim light, soft long shadows, tilt-shift miniature look. Cohesive color palette of deep navy #071A2B, deep emerald #0B3D35, emerald #12665A, champagne gold #D6B36A, rich gold #B88A35 and warm ivory #FAF7F0. Elegant, timeless and celebratory. Highly detailed, centered composition with the main subject in the middle. Any people are tiny figures seen from a distance with no visible faces. Absolutely no text, no letters, no numbers, no logos.
Subject: an elegant grand ballroom seen with its roof open, crystal chandeliers glowing gold, round tables dressed in emerald and ivory with gold centerpieces, a polished dance floor in the middle, a tall tiered celebration cake with gold decoration on a small stage, tiny elegantly dressed guests mingling, tall windows looking out on a night garden.
```

**Wide clip 5**: start frame `frames/wide-4-last.png` · save as `wide-5.mp4`
```
Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. The camera glides toward the glowing lights and rises gently over an elegant grand ballroom at night, its crystal chandeliers glowing gold above round tables in emerald and ivory, then descends slowly over the dance floor toward the tall tiered celebration cake on the small stage. In the final second, settle into a slow, steady forward drift toward the cake, coming gently to rest. Soft matte clay miniature diorama, tilt-shift, warm golden light, deep navy, emerald and champagne gold palette. Smooth, graceful, slow motion, subtle parallax. No text, no captions.
```

---

## The tall phone version (after the wide version works)

The phone clips are a separate chain, made the same way but tall.

1. When `still-1.png` is ready, Claude places it on a tall navy background and saves it as
   `frames/tall-start-1.png`.
2. Make **tall clip 1** from `frames/tall-start-1.png` with the **wide clip 1 prompt**, adding this
   sentence at the very start:
   ```
   Vertical portrait composition, the diorama centered with generous deep navy space above and below.
   ```
   Aspect ratio **9:16**, same other settings. Save as `tall-1.mp4`.
3. Tall clips 2 to 5 use the matching wide prompt with the same sentence added at the start. Each one
   starts from the last frame of the tall clip before it (`frames/tall-1-last.png` and so on, which
   Claude makes). Save them as `tall-2.mp4` … `tall-5.mp4`.

Never start a tall clip from a wide frame, or the reverse: each version only joins up with itself.

---

## What Claude does with the files

- Pulls out each clip's last frame for you as you go.
- Checks every join so the camera never jumps.
- Compresses the clips so they scrub smoothly on laptops and phones.
- Builds the scrolling journey into the **Life Story** page with the text above, a still-picture
  version for guests who turn motion off, and the RSVP button at the end.
