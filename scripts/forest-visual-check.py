"""Render the local preview using only its synthetic four-pose sheets.

Requires Playwright, Pillow, Chromium, and a server at the supplied URL.
Usage: python scripts/forest-visual-check.py URL OUTPUT_DIRECTORY
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

url, output = sys.argv[1:]
out = Path(output)
out.mkdir(parents=True, exist_ok=True)
views = [
    ("Valley", -22, 27, .15, 4),
    ("Bridge", -8, 9, 1.25, 7),
    ("Grove", -72, -13, 3.14, 11),
    ("Pond", -68, -29, .36, 6),
    ("Hill", 65, 63, -.94, 1),
]
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        executable_path=os.environ.get("CHROME_BIN"),
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 740}, has_touch=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if "Shader Error" in msg.text else None)
    page.goto(url)
    page.wait_for_function("window.forest !== undefined", timeout=90000)
    render = "() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"
    sheet = Image.new("RGB", (975, 392), "white")
    stats = {}
    for index, (name, x, z, yaw, month) in enumerate(views):
        page.evaluate("([x,z,yaw,m])=>{forest.setMonth(m);forest.setView({x,z,yaw})}", [x,z,yaw,month])
        page.evaluate(render)
        state = page.evaluate("forest.getState()")
        frame_ms = page.evaluate("""() => new Promise(resolve => {
          const times = [];
          function sample(now) {
            times.push(now);
            if (times.length < 25) requestAnimationFrame(sample);
            else resolve(times.slice(1).map((t,i) => t-times[i]));
          }
          requestAnimationFrame(sample);
        })""")
        stats[name] = {
            "calls": state["drawCalls"],
            "triangles": state["triangles"],
            "fps": round(1000 * len(frame_ms) / sum(frame_ms), 1),
            "p95_ms": round(sorted(frame_ms)[-2], 1),
        }
        if "cameraDistance" in state:
            assert state["cameraDistance"] >= 13, (name, state["cameraDistance"])
        path = out / (name + ".png")
        page.screenshot(path=path)
        shot = Image.open(path).convert("RGB")
        assert len(shot.resize((70,140)).getcolors(10000)) > 100
        sheet.paste(shot.resize((195,370)), (index*195, 22))
        ImageDraw.Draw(sheet).text((index*195+6, 4), name, fill="black")
    sheet.save(out / "overview.jpg")
    page.evaluate("forest.setView({x:-7,z:6,yaw:Math.PI/2})")
    touch = page.context.new_cdp_session(page)
    stick = page.get_by_label("移動用スティック").bounding_box()
    point = {"x": stick["x"] + stick["width"]/2, "y": stick["y"] + stick["height"]*.13}
    touch.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point]})
    page.wait_for_function("forest.getState().x > 17", timeout=90000)
    touch.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.evaluate("forest.setView({x:23,z:9,yaw:0})")
    page.get_by_role("button", name="はなす").click()
    assert page.evaluate("forest.getState().chatOpen")
    page.screenshot(path=out / "Encounter.png")
    assert not errors and not page.evaluate("forestErrors"), errors
    (out / "frames.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps(stats))
    browser.close()
