import {canonicalForestMention} from './forest-character-registry.mjs';
import {validateForestWrittenTurn} from './book-forest-gesture.mjs';
import {unsafeForestForaging} from './book-forest-output-safety.mjs';

// An observed failure was a standalone promise to go, begin or prepare.
// This catches that ending shape; whether a reply earns its choice also
// depends on context and is checked on real conversations.
// A movement invitation with a comma or a sentence break before the verb
// still promises a next action. A description of a possible location is fine.
const openInvitation=/(?:^|[、。！？!?])(?:さあ[、]?|じゃあ[、]?)?(?:いこう|行こう|はじめよう|始めよう|ついておいで)(?:ね|よ|ぜ|ぞ|か)?[。！？!?]*$/u;
const unfinished=/[？?][。！!]*$|(?:おしえて|教えて|かくる|ましょう|てみよう|ついてこい|(?:みせ|見せ)てあげる)(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$|(?:準備(?:を)?(?:する|しよう)|じゅんび(?:を)?(?:する|しよう)|(?:まで|へ|に)(?:行こう|いこう)|(?:始め|はじめ)(?:よう|る)|(?:今度|こんど)(?:やろう|しよう))(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$/u;

export function forestEndingNeedsReply(text){
  if(typeof text!=='string')return false;
  const compact=text.replace(/[ 　]/gu,'');
  return unfinished.test(compact)||openInvitation.test(compact);
}

export function forestEndingChoices(choices,{context={},silent=false,multi=false,line='',validLine=()=>true}={}){
  if(!Array.isArray(choices))return [];
  const offered=[];
  for(const choice of choices.slice(0,3)){
    if(typeof choice?.label!=='string'||typeof choice.outcome!=='string')continue;
    const label=canonicalForestMention(choice.label.trim(),context.speakers);
    const outcome=canonicalForestMention(choice.outcome.trim(),context.speakers);
    if(label.length<2||label.length>24||/[\r\n{}<>「」]/u.test(label)||
      outcome.length<2||outcome.length>(silent?140:90)||/[{}<>]/u.test(outcome)||
      (!silent&&/[\r\n]/u.test(outcome))||offered.some(c=>c.label===label))continue;
    const speakerSlot=choice.speakerSlot;
    if(multi&&speakerSlot!==1&&speakerSlot!==2)continue;
    const written=silent?validateForestWrittenTurn(outcome,choice.delivery??'written'):null;
    if(silent?!written:!validLine(outcome))continue;
    const text=written?.text??outcome;
    if(forestEndingNeedsReply(text)||text===line||offered.some(c=>c.outcome===text))continue;
    if(unsafeForestForaging({text,choices:[label]},
      {...context,chosenLabel:label,recentTurns:[...(context.recentTurns||[]),{npc:line}]}))continue;
    offered.push({label,outcome:text,...(multi?{speakerSlot}:{}),...(written?{delivery:written.delivery}:{})});
    if(offered.length===2)break;
  }
  return offered;
}
