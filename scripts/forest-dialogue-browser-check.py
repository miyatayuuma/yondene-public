"""Exercise the real forest UI with a synthetic AI response.

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
import {createForestLiveDialogueDirector} from '../reading-shelf-firebase/book-forest-live-dialogue.mjs';
import {profileFixture} from '../reading-shelf-firebase/forest-profile-fixture.mjs';
window.testPrompts=[];
const namePair={id:'fixture-pair',schemaVersion:1,approval:'approved',firstName:'あお',secondName:'そら'};
const dialogue=createForestLiveDialogueDirector({
  getTwinNames:()=>[namePair],storage:localStorage,
  startDelayMs:0,getCharacterProfiles:()=>[...FOREST_AI_SPEAKER_IDS,'twins','cat'].map(id=>profileFixture({id,firstPerson:'わたし'})),
  generate:async prompt=>{
    testPrompts.push(prompt);
    if(new URLSearchParams(location.search).has('fail'))throw Error('fixture unavailable');
    if(prompt.npc.id==='cat')return {text:'木の 下なら、雨が ふっても 休めるよ。',
      delivery:'written',choices:['見てみる','またね']};
    if(prompt.npc.id==='twins')return {
      turns:prompt.mode==='opening'?[{speakerSlot:1,text:'わたしはあお。'},{speakerSlot:2,text:'わたしはそら。'}]:
        [{speakerSlot:2,text:'小川を見に行こう。'},{speakerSlot:1,text:'足もとに気をつけてね。'}],
      choices:prompt.closing?[]:prompt.context.repliesLeft===1?[{label:'水の音を聞く',outcome:'さらさらって聞こえたね。',speakerSlot:2}]:['いっしょに見る','またね']};
    return {text:prompt.mode==='opening'?'まるい木の実を見つけたよ。':'じゃあ、いっしょに見てみよう。',
      choices:prompt.closing?[]:prompt.context.repliesLeft===1?[{label:'いっしょに見る',outcome:'木の上に小さな鳥がいるよ。'}]:['いっしょに見る','ここで待つ']};
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
        page.locator('.bookForestDismiss').click()
        page.evaluate('forest.setView({x:52,z:30,yaw:0})')
        page.get_by_role('button', name='はなす', exact=True).click()
        turns = page.locator('.bookForestTwinTurn')
        expect(turns.first.locator('.bookForestTwinName')).to_have_text('あお')
        expect(turns.nth(1).locator('.bookForestTwinName')).to_have_text('そら', timeout=15000)
        expect(turns.nth(1).locator('.bookForestTwinText')).to_have_attribute('role', 'button')
        page.get_by_role('button', name='いっしょに見る', exact=True).click()
        expect(turns.nth(2).locator('.bookForestTwinName')).to_have_text('そら')
        expect(turns.nth(3).locator('.bookForestTwinName')).to_have_text('あお', timeout=15000)
        assert page.evaluate('testPrompts.at(-1).context.chosenLabel') == 'いっしょに見る'
        page.screenshot(path=out / 'twins.png')
        page.get_by_role('button', name='水の音を聞く', exact=True).click()
        expect(turns.last.locator('.bookForestTwinName')).to_have_text('そら')
        expect(turns.last.locator('.bookForestTwinText')).to_have_text('さらさらって聞こえたね。')
        expect(page.locator('.bookForestDismiss')).to_have_text('またね', timeout=15000)
        page.locator('.bookForestDismiss').click()
        page.evaluate('forest.setView({x:-49,z:23,yaw:0})')
        page.get_by_role('button', name='はなす', exact=True).click()
        expect(page.locator('.bookForestWritingNote')).to_have_text('（ねこは字を書いて見せた。）')
        expect(page.locator('.bookForestMessage')).to_contain_text('木の 下なら、雨が ふっても 休めるよ。')
        assert page.locator('.bookForestMessage').get_attribute('role') is None
        page.goto(url + '?fail=1')
        page.wait_for_function('window.forest !== undefined', timeout=90000)
        page.evaluate('forest.setView({x:23,z:9,yaw:0})')
        page.get_by_role('button', name='はなす', exact=True).click()
        expect_message('また森で会おうね。')
        page.screenshot(path=out / 'fallback.png')
        assert not errors and not page.evaluate('forestErrors'), errors
        print(json.dumps({'opening': 'PASS', 'reply': 'PASS', 'closing': 'PASS',
                          'revisit': 'PASS', 'twins': 'PASS', 'cat': 'PASS', 'fallback': 'PASS', 'pageErrors': errors}))
        browser.close()
finally:
    server.shutdown()
