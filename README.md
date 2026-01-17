# CALC / ケイサン

Minimal arithmetic practice web app with rhythm-based feedback.  
Solve problems correctly to build a techno-style beat.

**Demo**  
https://keisan.notegridx.dev

---

## Overview

**CALC / ケイサン** is a minimalist calculation practice web app.  
Correct answers increase your score and gradually build a drum-machine style rhythm.  
A wrong answer resets the beat back to a simple kick.

The goal is to combine **mental arithmetic** with **rhythmic feedback** to create a focused, game-like learning experience.

---

## Features

- Simple arithmetic problems (addition, subtraction, multiplication, division)
- Rhythm-based feedback using Web Audio API
- Beat grows with correct answers
  - Kick → Kick + Hi-hat → Kick + Hi-hat + Snare
- Difficulty increases as you clear stages
- Minimal UI with keyboard-first interaction
- No backend, no tracking, runs entirely in the browser

---

## How to Play

1. Look at the formula displayed in the center of the screen
2. Type the answer
3. Press **Enter** or click **CHECK**
4. Keep answering correctly to build the beat
5. A wrong answer resets the rhythm

You can toggle:
- **BGM**: background drum machine
- **SFX**: sound effects for correct / wrong answers

---

## Tech Stack

- HTML
- CSS (custom, no framework)
- JavaScript (Vanilla)
- Web Audio API
- Hosted on Cloudflare Pages

---

## Project Structure

```
keisan/
├─ index.html
├─ assets/
│  ├─ css/
│  │  └─ style.css
│  ├─ js/
│  │  └─ app.js
│  └─ audio/
│     ├─ correct.mp3
│     ├─ wrong.mp3
│     ├─ bgm_switch.mp3
│     └─ stage_clear.mp3
└─ README.md
```

---

## License

This project is licensed under the **MIT License**.  
See the `LICENSE` file for details.

---

## Author

**notegridx**  
GitHub: https://github.com/notegridx

---

## Notes

This project is an experimental learning tool.  
No data is collected, stored, or transmitted.

Feedback and ideas are welcome via GitHub Issues.
