"""Exercise the real forest UI with zero cues and a synthetic AI response.

Requires Playwright and Chromium. Uses no production API, books or private assets.
Run: python scripts/forest-dialogue-browser-check.py [output-directory]
"""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import sys
import threading

from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/forest-dialogue-browser')
out.mkdir(parents=True, exist_ok=True)
html = (root / 'scripts/forest-preview.html').read_text(encoding='utf-8')
html = html.replace('<head>', '<head><meta charset="utf-8">')
imports = """
import {FOREST_AI_SPEAKER_IDS} from '../reading-shelf-firebase/forest-character-registry.mjs';
import {createForestDialogueDirector} from '../reading-shelf-firebase/book-forest-dialogue-director.mjs';
import {createForestLiveDialogueDirector} from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
const profile={id:'kiki',summary:'架空の観察好きな人物',firstPerson:'わたし',cadence:'短く話す',
  avoid:'説教しない',values:'',motivation:'',relationships:'',behavior:'',reactions:'',
  address:'',endings:'',habits:'',expression:'',emotion:'',review:''};
window.testPrompts=[];
const dialogue=createForestLiveDialogueDirector({
  base:createForestDialogueDirector({storage:localStorage}),storage:localStorage,
  startDelayMs:0,requireCharacterProfile:true,getCharacterProfiles:()=>FOREST_AI_SPEAKER_IDS.map(id=>({...profile,id})),
  generate:async prompt=>{
    testPrompts.push(prompt);
    if(new URLSearchParams(location.search).has('fail'))throw Error('fixture unavailable');
    return {text:prompt.mode==='opening'?'まるい木の実を見つけたよ。':'じゃあ、いっしょに見てみよう。',
      choices:prompt.closing?[]:['いっしょに見る','ここで待つ']};
  }
});
"""
html = html.replace("const colors=", imports + "\nconst colors=")
html = html.replace("mountBookForest({familyId:'test',", "mountBookForest({dialogue,familyId:'test',")
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/scripts/forest-preview.html'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome'),
            args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        )
        page = browser.new_page(viewport={'width': 390, 'height': 740}, has_touch=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/scripts/forest-preview.html*', lambda route: route.fulfill(content_type='text/html; charset=utf-8', body=html))
        def expect_message(text):
            try:
                expect(page.locator('.bookForestMessage')).to_be_visible()
                expect(page.locator('.bookForestMessage')).to_have_text(text, timeout=15000)
            except AssertionError:
                print(json.dumps({'state': page.evaluate('forest.getState()'),
                                  'message': page.locator('.bookForestMessage').inner_text(),
                                  'promptKinds': page.evaluate('testPrompts.map(p=>[p.npc.id,p.mode,p.context.sourceKind])'),
                                  'errors': errors}, ensure_ascii=False))
                page.screenshot(path=out / 'failure.png')
                raise

        page.goto(url)
        page.wait_for_function('window.forest !== undefined', timeout=90000)
        page.evaluate('forest.setView({x:23,z:9,yaw:0})')
        page.get_by_role('button', name='はなす', exact=True).click()
        expect_message('まるい木の実を見つけたよ。')
        assert page.evaluate('testPrompts[0].context.situation.firstEncounter')
        page.screenshot(path=out / 'opening.png')
        page.get_by_role('button', name='いっしょに見る', exact=True).click()
        expect_message('じゃあ、いっしょに見てみよう。')
        page.get_by_role('button', name='いっしょに見る', exact=True).click()
        expect(page.get_by_role('button', name='またね', exact=True)).to_be_visible()
        page.get_by_role('button', name='またね', exact=True).click()
        page.get_by_role('button', name='はなす', exact=True).click()
        expect_message('まるい木の実を見つけたよ。')
        assert not page.evaluate('testPrompts.at(-1).context.situation.firstEncounter')
        page.screenshot(path=out / 'revisit.png')
        page.goto(url + '?fail=1')
        page.wait_for_function('window.forest !== undefined', timeout=90000)
        page.evaluate('forest.setView({x:23,z:9,yaw:0})')
        page.get_by_role('button', name='はなす', exact=True).click()
        expect_message('（森の風に、そっと耳をすませている。）')
        page.screenshot(path=out / 'fallback.png')
        assert not errors and not page.evaluate('forestErrors'), errors
        print(json.dumps({'opening': 'PASS', 'reply': 'PASS', 'closing': 'PASS',
                          'revisit': 'PASS', 'fallback': 'PASS', 'pageErrors': errors}))
        browser.close()
finally:
    server.shutdown()
