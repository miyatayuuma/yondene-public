import {canonicalForestMention} from './forest-character-registry.mjs';
import {validateForestWrittenTurn} from './book-forest-gesture.mjs';
import {unsafeForestForaging} from './book-forest-output-safety.mjs';

// An observed failure was a standalone promise to go, begin or prepare.
// This catches that ending shape; whether a reply earns its choice also
// depends on context and is checked on real conversations.
// A movement invitation with a comma or a sentence break before the verb
// still promises a next action. A description of a possible location is fine.
const openInvitation=/(?:^|[、]|へ|まで|に|ついて)(?:いこう|行こう|いきましょう|行きましょう|はじめよう|始めよう|おいで)(?:ね|よ|ぜ|ぞ|か)?$/u;
const unperformedAction=/(?:^|[。！!\n])(?:よし[、！!]|うん[、。])?[^。！!\n]{0,35}(?:正体を暴(?:く|いてやる)|(?:決め|きめ)(?:なきゃ|なくちゃ)|(?:確かめ|たしかめ|調べ|しらべ)(?:よう|てくる)|(?:準備|じゅんび)(?:を)?(?:してくる|しておく))(?=よ|ね|ぞ|ぜ|[。！!]|$)/u;
const relayRequest=/(?:伝え|つたえ)(?:て(?:おく|おきます|おいて|くる|あげる|あげます|くれる|くれない|ね|よ)|とく|たい|よう|ましょう|て(?=[。！？!?]|$))/u;
const sayingToSomeone=/(?:言っ|いっ)(?:て(?:おく|おきます|おいて|くる|あげる|あげます|くれる|くれない|ね|よ)|とく)/u;
const offscreenAction=/(?:連れて|つれて)(?:行く|いく|くる)(?:よ|ね|ぜ|ぞ|から)?(?=[。！!」』）]|$)|(?:呼んで|よんで|持って|もって|取って|とって)(?:くる|きます)(?:よ|ね|ぜ|ぞ|から)?(?=[。！!」』）]|$)|(?:合流|ごうりゅう)し(?:よう|てくる)(?:よ|ね|ぜ|ぞ)?(?=[。！!」』）]|$)/u;

export function forestUnsupportedAction(text,context={}){
  if(typeof text!=='string')return false;
  const compact=text.replace(/[ 　]/gu,'');
  if(offscreenAction.test(compact))return true;
  if(context.handoffTo)return false;
  if(relayRequest.test(compact))return true;
  const recipients=[...Object.values(context.npcDisplayNames||{}),...(context.speakers||[]).map(s=>s.name),
    '王さま','おうさま','本人','あの子','あのこ','みんな','相手'];
  return compact.split(/[。！？!?]/u).some(sentence=>
    recipients.some(name=>name&&sentence.includes(name+'に'))&&sayingToSomeone.test(sentence));
}

export function forestMisattributesReviewTitle(text,context={}){
  const {bookTitle,quote}=context.readerReflection||{};
  if(!bookTitle||!quote||typeof text!=='string')return false;
  const compact=value=>value.normalize('NFKC').replace(/\s+/gu,'');
  const quoted=compact(quote),title=compact(bookTitle);
  const bookName=/[「『]([^」』]+)[」』](?:という|っていう)(?:タイトル|題名|書名|本(?:を|の|は|が))/gu;
  const inventedTitle=/(?:^もし|なら|だったら|かりの|仮の|つける|付ける|つけた|付けた|考えた|かんがえた|候補|そうぞう|想像)/u;
  for(const sentence of compact(text).split(/[。！？!?]/u)){
    if(inventedTitle.test(sentence))continue;
    for(const [,name] of sentence.matchAll(bookName)){
      if(title.includes(name))continue;
      // Gemma sometimes changes the script of the end of a quoted name.
      if(quoted.includes(name)||(name.length>=5&&quoted.includes(name.slice(0,-1)))||(name.length>=7&&quoted.includes(name.slice(0,-2))))return true;
    }
  }
  return false;
}

const unfinished=/[？?][。！!]*$|(?:おしえて|教えて|かくる|ましょう|てみよう|ついてこい|(?:みせ|見せ)て(?:あげる|くれ|ちょうだい))(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$|(?:準備(?:を)?(?:する|しよう)|じゅんび(?:を)?(?:する|しよう)|(?:まで|へ|に)(?:行こう|いこう)|(?:始め|はじめ)(?:よう|る)|(?:今度|こんど)(?:やろう|しよう))(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$/u;

export function forestEndingNeedsReply(text){
  if(typeof text!=='string')return false;
  const compact=text.replace(/[ 　]/gu,'').replace(/[」』）]+$/u,'');
  return unfinished.test(compact)||unperformedAction.test(compact)||compact.split(/[。！？!?]/u)
    .some(sentence=>openInvitation.test(sentence));
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
    if(forestEndingNeedsReply(text)||forestUnsupportedAction(text,context)||forestUnsupportedAction(label,context)||
      forestMisattributesReviewTitle(text,context)||forestMisattributesReviewTitle(label,context)||text===line||offered.some(c=>c.outcome===text))continue;
    if(unsafeForestForaging({text,choices:[label]},
      {...context,chosenLabel:label,recentTurns:[...(context.recentTurns||[]),{npc:line}]}))continue;
    offered.push({label,outcome:text,...(multi?{speakerSlot}:{}),...(written?{delivery:written.delivery}:{})});
    if(offered.length===2)break;
  }
  return offered;
}
