# Fiona's clips

Put video clips in this folder and Fiona is shown as those clips instead
of the drawn cat. With no clips here, she's the drawn cat.

(In the built `Fiona.exe`, the folder is elsewhere: tray menu → **Open
clips folder**. After adding or changing clips: tray menu → **Reload
clips**.)

## The files

One clip per action, named after it:

| File | When it plays | If it's missing |
| --- | --- | --- |
| `sit.mp4` | Idle, watching the cursor | Needed. Everything else falls back to it |
| `walk.mp4` | Walking to the cursor | Uses `run`, else `sit` |
| `run.mp4` | Cursor is far away | Uses `walk` played faster |
| `eat.mp4` | The fish cursor comes down to her | Uses `sit` |
| `sleep.mp4` | Mouse idle for 25 s | Uses `sit` |
| `wake.mp4` | Mouse moves while she's asleep | Uses `sit` |

Start with just `sit.mp4` to see it working, then add the others.

Format: **H.264 MP4** or **WebM**. Most video tools export H.264 MP4
by default. HEVC/H.265 (what iPhones record) may not play; re-export
as H.264.

## What each clip must look like

The app removes the background itself, so every clip needs:

1. **A plain, solid, bright green background** (`#00FF00`), with nothing
   else in it: no floor, no props, no scenery, no gradient.
2. **Fiona facing right**, seen from the side (a three-quarter view is
   fine). The app mirrors the clip when she goes left.
3. **Her whole body in frame**, feet included, with a little space
   around her.
4. **A camera that doesn't move**, and Fiona staying in the same spot.
   For walking and running she walks *on the spot*, like on a
   treadmill. The app moves her across the screen.
5. **A loop**: 2–4 seconds, ending in about the pose it started in.
6. **The same size and framing in every clip**, so she doesn't change
   size between actions.

Nothing on Fiona herself should be green.

## Making them with AI tools

Three steps. Any image model that accepts a reference image and any
image-to-video model will do.

### 1. Design Fiona once

Generate until you have one you love, then keep that image. It's the
reference for everything else.

> A tiny chubby egg-shaped white kitten, soft needle-felted wool fur
> with visible fine fibres, huge glossy dark eyes with sparkling
> highlights, small pink nose, rosy pink blush cheeks, tiny rounded ears
> with pink insides, stubby paws, short fluffy tail. Full body, side
> view facing right. 3D render, Pixar style, kawaii, soft even studio
> lighting. Plain solid bright green background (#00FF00), no shadow on
> the background, no floor, no props.

### 2. Make a starting image for each action

Attach the image from step 1 as the character reference, and keep the
last sentence about the background in every prompt.

- **sit**: "The same kitten sitting upright, side view facing right,
  looking slightly up."
- **walk / run**: "The same kitten standing on all four paws mid-step,
  side view facing right."
- **eat**: "The same kitten sitting, leaning forward with its head
  down, mouth open, side view facing right."
- **sleep**: "The same kitten curled up in a loaf, eyes closed, side
  view facing right."

### 3. Animate each image

Give the image from step 2 to an image-to-video model as the first
frame. One simple action per clip works best.

- **sit**: "The kitten sits still, blinks slowly, ears twitch, tail
  sways gently. Static camera. Seamless loop. The solid green
  background stays unchanged."
- **walk**: "The kitten walks in place on the spot, a steady walk
  cycle, like on a treadmill. It stays in the centre of the frame.
  Static camera. Seamless loop. The solid green background stays
  unchanged."
- **run**: the same, with "runs in place, bouncy and fast".
- **eat**: "The kitten nibbles happily, chewing, eyes closing with
  joy. Static camera. Seamless loop. The solid green background stays
  unchanged."
- **sleep**: "The kitten sleeps, breathing slowly, fur rising and
  falling. Static camera. Seamless loop. The solid green background
  stays unchanged."
- **wake**: "The sleeping kitten startles awake, eyes wide, and sits
  up. Static camera. The solid green background stays unchanged."

Then trim each clip to a clean loop in any video editor, name it as in
the table, and drop it in this folder.

Expect to re-roll. Sitting and sleeping usually come out well first
time. **Walking on the spot is the hard one**: models like to move the
cat across the frame or pan the camera. If it won't behave, skip
`walk.mp4` and `run.mp4` at first.

## Adjusting how they look

Optional: add a `config.json` here.

```json
{
  "height": 200,
  "tolerance": 70,
  "softness": 60,
  "clips": {
    "walk": { "scale": 1.1, "dy": 4, "speed": 1.2 }
  }
}
```

| Setting | What it does |
| --- | --- |
| `height` | How tall the clip's full frame is on screen, in pixels. Bigger number, bigger Fiona |
| `tolerance` | How aggressively the background is removed. Raise it if green is left behind; lower it if parts of Fiona vanish |
| `softness` | How soft her edge is |
| `key` | Background colour. Default `"auto"` reads it from the clip's top corners. Set `"#rrggbb"` to force one, or `"none"` for clips that already have transparency |
| `clips.<name>.scale` | Resize one clip to match the others |
| `clips.<name>.dx`, `dy` | Nudge one clip sideways or down, in pixels |
| `clips.<name>.speed` | Playback speed of one clip |
