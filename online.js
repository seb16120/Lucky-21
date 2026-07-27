
"use strict";

const RULES = Object.freeze({ size: 7, hand: 4, move: 3, boost: 5, roundPoints: 4, matchRounds: 2 });
const els = Object.fromEntries([
  "lobby","game","create-form","join-form","create-name","join-name","memory-seconds","room-code","lobby-status","lobby-message","scroll-to-game",
  "sync-label","leave-button","copy-code","round-number","phase-label","status-title","status-message","memory-countdown",
  "board","board-panel","boost-toggle","take-button","pass-button","hand","hand-count","selection-help","score-button","deposit-button",
  "result-dialog","close-result","result-title","result-message","continue-button",
].map((id) => [id.replaceAll("-", "_"), document.querySelector(`#${id}`)]));
els.playerCards = [document.querySelector("#player-0-card"), document.querySelector("#player-1-card")];
els.playerNames = [document.querySelector("#player-0-name"), document.querySelector("#player-1-name")];
els.playerRound = [document.querySelector("#player-0-round"), document.querySelector("#player-1-round")];
els.playerMatch = [document.querySelector("#player-0-match"), document.querySelector("#player-1-match")];
els.directions = [...document.querySelectorAll("[data-direction]")];

const config = window.LUCKY21_SUPABASE ?? {};
const db = window.supabase?.createClient?.(config.url, config.publishableKey);
let session = null;
let roomId = null;
let roomCode = "";
let seat = null;
let version = 0;
let game = null;
let channel = null;
let selected = new Set();
let applyingRemote = false;
let saving = false;

function player(name) {
  return { name, roundScore: 0, matchScore: 0, boost: true, hand: [] };
}

function makeDeck() {
  const values = [];
  for (let value = 1; value <= 17; value += 1) for (let copy = 0; copy < 3; copy += 1) values.push(value);
  shuffle(values);
  values.splice(0, 2);
  const deck = values.map((value, index) => ({ id: `${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2,7)}`, value, clover: false }));
  [3,4,5,6,7,7,7,8,9,10,11].forEach((value) => {
    const tile = deck.find((candidate) => candidate.value === value && !candidate.clover);
    if (tile) tile.clover = true;
  });
  shuffle(deck.filter((tile) => !tile.clover)).slice(0,3).forEach((tile) => { tile.clover = true; });
  return shuffle(deck);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [items[index], items[random]] = [items[random], items[index]];
  }
  return items;
}

function initialState(hostName, memorySeconds) {
  const deck = makeDeck();
  return {
    players: [player(hostName), player("En attente…")],
    board: deck.map((tile, index) => ({ row: Math.floor(index / 7), col: index % 7, tile })),
    pawn: { row: 3, col: 3 },
    currentPlayer: 0,
    roundNumber: 1,
    phase: "waiting",
    memorySeconds,
    memoryUntil: null,
    steps: 0,
    limit: 1,
    boostUsed: false,
    firstTurn: true,
    turnStart: null,
    forbidden: null,
    result: null,
  };
}

async function ensureSession() {
  if (!db) throw new Error("Supabase est indisponible.");
  const { data: current } = await db.auth.getSession();
  session = current.session;
  if (!session) {
    const { data, error } = await db.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
}

async function createRoom(event) {
  event.preventDefault();
  setLobbyMessage("Création du salon…");
  try {
    await ensureSession();
    const name = els.create_name.value.trim() || "Joueur 1";
    const state = initialState(name, Number(els.memory_seconds.value) || 15);
    const { data, error } = await db.rpc("lucky21_create_room", { p_display_name: name, p_state: state });
    if (error) throw error;
    openRoom(normalizeRow(data), 0);
  } catch (error) { setLobbyMessage(friendlyError(error), true); }
}

async function joinRoom(event) {
  event.preventDefault();
  setLobbyMessage("Connexion au salon…");
  try {
    await ensureSession();
    const code = els.room_code.value.trim().toUpperCase();
    const name = els.join_name.value.trim() || "Joueur 2";
    const { data, error } = await db.rpc("lucky21_join_room", { p_code: code, p_display_name: name });
    if (error) throw error;
    openRoom(normalizeRow(data), 1);
  } catch (error) { setLobbyMessage(friendlyError(error), true); }
}

function normalizeRow(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Salon introuvable.");
  return row;
}

function openRoom(row, mySeat) {
  roomId = row.id;
  roomCode = row.code;
  seat = mySeat;
  applyRoom(row);
  els.lobby.hidden = true;
  els.game.hidden = false;
  els.copy_code.textContent = roomCode;
  subscribe();
  render();
}

function applyRoom(row) {
  applyingRemote = true;
  version = Number(row.version ?? 0);
  game = typeof row.state === "string" ? JSON.parse(row.state) : row.state;
  selected.clear();
  applyingRemote = false;
  render();
}

function subscribe() {
  if (channel) db.removeChannel(channel);
  channel = db.channel(`lucky21-${roomId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lucky21_rooms", filter: `id=eq.${roomId}` }, (payload) => {
      if (Number(payload.new.version) > version) applyRoom(payload.new);
    })
    .subscribe((status) => { els.sync_label.textContent = status === "SUBSCRIBED" ? "● Synchronisé" : "Synchronisation…"; });
}

async function save() {
  if (!game || saving || applyingRemote) return;
  saving = true;
  try {
    const { data, error } = await db.rpc("lucky21_update_room", { p_room_id: roomId, p_expected_version: version, p_state: game });
    if (error) throw error;
    applyRoom(normalizeRow(data));
  } catch (error) {
    const { data } = await db.rpc("lucky21_get_room", { p_room_id: roomId });
    if (data) applyRoom(normalizeRow(data));
    setStatus("Synchronisation reprise", "Une action concurrente a été reçue avant la vôtre.");
  } finally { saving = false; }
}

function isMyTurn() { return game?.currentPlayer === seat && !["waiting","memory","round-over","match-over"].includes(game?.phase); }
function cellAt(row, col) { return game.board.find((cell) => cell.row === row && cell.col === col); }
function currentCell() { return cellAt(game.pawn.row, game.pawn.col); }
function same(a,b) { return Boolean(a && b && a.row === b.row && a.col === b.col); }

function move(direction) {
  if (!isMyTurn() || game.phase !== "move" || game.steps >= game.limit) return;
  const delta = { up:[-1,0], down:[1,0], left:[0,-1], right:[0,1] }[direction];
  const row = game.pawn.row + delta[0], col = game.pawn.col + delta[1];
  if (row < 0 || col < 0 || row >= 7 || col >= 7) return;
  game.pawn = { row, col };
  game.steps += 1;
  render();
  save();
}

function chooseBoost() {
  if (!isMyTurn() || game.phase !== "move" || game.steps || game.firstTurn || !game.players[seat].boost) {
    els.boost_toggle.checked = game?.boostUsed ?? false;
    return;
  }
  game.boostUsed = els.boost_toggle.checked;
  game.limit = game.boostUsed ? RULES.boost : RULES.move;
  render();
  save();
}

function validLanding() { return game.steps > 0 && !same(game.pawn, game.forbidden); }

function takeOrDeposit() {
  if (!isMyTurn()) return;
  if (game.phase === "deposit") return deposit();
  if (game.phase !== "move" || !validLanding()) return;
  const me = game.players[seat], cell = currentCell();
  if (game.boostUsed) me.boost = false;
  if (cell.tile && me.hand.length < RULES.hand) {
    me.hand.push(cell.tile);
    cell.tile = null;
    game.phase = has21(me.hand) ? "resolve" : "move";
    if (game.phase === "move") finishTurn();
  } else if (!cell.tile && me.hand.length) game.phase = "deposit";
  render();
  save();
}

function pass() {
  if (!isMyTurn() || (game.phase === "move" && !validLanding())) return;
  if (game.boostUsed) game.players[seat].boost = false;
  finishTurn();
  render();
  save();
}

function finishTurn() {
  game.forbidden = game.turnStart ? { ...game.turnStart } : null;
  game.firstTurn = false;
  game.currentPlayer = 1 - game.currentPlayer;
  game.phase = "move";
  game.steps = 0;
  game.limit = RULES.move;
  game.boostUsed = false;
  game.turnStart = { ...game.pawn };
  selected.clear();
}

function toggleTile(id) {
  if (!isMyTurn() || !["resolve","deposit"].includes(game.phase)) return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < (game.phase === "deposit" ? 1 : 3)) selected.add(id);
  render();
}

function chosenTiles() { return game.players[seat].hand.filter((tile) => selected.has(tile.id)); }
function has21(hand) {
  for (let a=0;a<hand.length-2;a+=1) for (let b=a+1;b<hand.length-1;b+=1) for (let c=b+1;c<hand.length;c+=1) if (hand[a].value+hand[b].value+hand[c].value===21) return true;
  return false;
}

function score() {
  const tiles = chosenTiles();
  if (!isMyTurn() || game.phase !== "resolve" || tiles.length !== 3 || tiles.reduce((sum,tile)=>sum+tile.value,0)!==21) return;
  const points = tiles.every((tile)=>tile.value===7) || tiles.every((tile)=>tile.clover) ? 2 : 1;
  const ids = new Set(tiles.map((tile)=>tile.id));
  const me = game.players[seat];
  me.hand = me.hand.filter((tile)=>!ids.has(tile.id));
  me.roundScore += points;
  selected.clear();
  if (me.roundScore >= RULES.roundPoints) {
    me.matchScore += 1;
    game.result = { title: `${me.name} remporte le round`, message: `${points} point${points>1?"s":""} sur le dernier Lucky 21.` };
    game.phase = me.matchScore >= RULES.matchRounds ? "match-over" : "round-over";
  } else {
    game.result = { title: "Lucky 21 !", message: `${me.name} marque ${points} point${points>1?"s":""}.` };
    finishTurn();
  }
  render();
  showResult();
  save();
}

function deposit() {
  const tiles = chosenTiles();
  if (!isMyTurn() || game.phase !== "deposit" || tiles.length !== 1 || currentCell().tile) return;
  const id = tiles[0].id;
  currentCell().tile = tiles[0];
  game.players[seat].hand = game.players[seat].hand.filter((tile)=>tile.id!==id);
  selected.clear();
  finishTurn();
  render();
  save();
}

function startNextRound() {
  if (!game || game.phase === "match-over") {
    location.href = "index.html";
    return;
  }
  const deck = makeDeck();
  game.players.forEach((item)=>{ item.roundScore=0; item.boost=true; item.hand=[]; });
  game.board = deck.map((tile,index)=>({row:Math.floor(index/7),col:index%7,tile}));
  game.pawn={row:3,col:3}; game.roundNumber+=1; game.currentPlayer=(game.roundNumber-1)%2;
  game.phase="memory"; game.memoryUntil=Date.now()+game.memorySeconds*1000; game.firstTurn=true; game.forbidden=null; game.result=null;
  selected.clear(); els.result_dialog.close(); render(); save();
}

function render() {
  if (!game) return;
  game.players.forEach((item,index)=>{
    els.playerNames[index].textContent=item.name;
    els.playerRound[index].textContent=item.roundScore;
    els.playerMatch[index].textContent=item.matchScore;
    els.playerCards[index].classList.toggle("active",index===game.currentPlayer && !["waiting","memory"].includes(game.phase));
  });
  els.round_number.textContent=`Round ${game.roundNumber}`;
  renderStatus();
  renderBoard();
  renderHand();
  renderControls();
  const opponentIsPlaying = !["waiting","memory","round-over","match-over"].includes(game.phase) && game.currentPlayer !== seat;
  els.board_panel.classList.toggle("waiting-turn", opponentIsPlaying);
  if (game.result && ["round-over","match-over"].includes(game.phase) && !els.result_dialog.open) showResult();
}

function renderStatus() {
  if (game.phase==="waiting") return setStatus("En attente de l’adversaire","Partagez le code du salon.","Préparation");
  if (game.phase==="memory") return setStatus("Mémorisez le plateau","Les tuiles vont bientôt être retournées.","Mémorisation");
  const name=game.players[game.currentPlayer].name;
  if (game.phase==="move") setStatus(`${name} déplace le pion`,`${game.steps}/${game.limit} pas · agir après au moins un déplacement.`,"Déplacement");
  if (game.phase==="deposit") setStatus(`${name} doit déposer une tuile`,"Choisissez une tuile du stockage.","Dépôt");
  if (game.phase==="resolve") setStatus(`${name} peut former 21`,"Sélectionnez exactement trois tuiles.","Résolution");
  if (game.phase==="round-over") setStatus("Round terminé","Le premier joueur a atteint 4 points.","Résultat");
  if (game.phase==="match-over") setStatus("Match terminé","Un joueur a remporté deux rounds.","Résultat");
}

function setStatus(title,message,label="Information"){ els.status_title.textContent=title;els.status_message.textContent=message;els.phase_label.textContent=label; }

function renderBoard() {
  els.board.replaceChildren();
  game.board.forEach((cell)=>{
    const button=document.createElement("button"); button.className="cell"; button.type="button";
    const adjacent=Math.abs(cell.row-game.pawn.row)+Math.abs(cell.col-game.pawn.col)===1;
    const reachable=isMyTurn()&&game.phase==="move"&&adjacent&&game.steps<game.limit;
    button.classList.toggle("reachable",reachable); button.classList.toggle("empty",!cell.tile); button.disabled=!reachable;
    if(cell.tile){
      const tile=document.createElement("span");
      const visible=game.phase==="memory" || (same(cell,game.pawn)&&["deposit","resolve"].includes(game.phase));
      tile.className=`tile${visible?" visible":""}`;
      if(visible) tile.innerHTML=`${cell.tile.value}${cell.tile.clover?'<span class="suit">♣</span>':""}`;
      button.append(tile);
    }
    if(same(cell,game.pawn)){const pawn=document.createElement("span");pawn.className="pawn";button.append(pawn);}
    button.addEventListener("click",()=>{const dr=cell.row-game.pawn.row,dc=cell.col-game.pawn.col;move(dr<0?"up":dr>0?"down":dc<0?"left":"right");});
    els.board.append(button);
  });
}

function renderHand() {
  const hand=game.players[seat]?.hand??[];
  els.hand_count.textContent=`${hand.length}/4`; els.hand.replaceChildren();
  for(let index=0;index<4;index+=1){
    const tile=hand[index];
    if(!tile){const empty=document.createElement("span");els.hand.append(empty);continue;}
    const button=document.createElement("button");button.type="button";button.classList.toggle("selected",selected.has(tile.id));
    button.innerHTML=`${tile.value}${tile.clover?'<span class="suit">♣</span>':""}`;button.disabled=!isMyTurn()||!["resolve","deposit"].includes(game.phase);
    button.addEventListener("click",()=>toggleTile(tile.id));els.hand.append(button);
  }
}

function renderControls() {
  const mine=isMyTurn(), movePhase=mine&&game.phase==="move";
  els.directions.forEach((button)=>{button.disabled=!movePhase||game.steps>=game.limit;});
  els.boost_toggle.checked=Boolean(game.boostUsed);els.boost_toggle.disabled=!movePhase||game.steps>0||game.firstTurn||!game.players[seat]?.boost;
  els.take_button.disabled=!mine||!["move","deposit"].includes(game.phase)||(game.phase==="move"&&!validLanding());
  els.pass_button.disabled=!mine||(game.phase==="move"&&!validLanding());
  const tiles=chosenTiles(),sum=tiles.reduce((total,tile)=>total+tile.value,0);
  els.score_button.hidden=game.phase!=="resolve";els.score_button.disabled=!mine||tiles.length!==3||sum!==21;
  els.deposit_button.hidden=game.phase!=="deposit";els.deposit_button.disabled=!mine||tiles.length!==1;
  els.selection_help.textContent=game.phase==="resolve"?`Sélection : ${tiles.length}/3 · Somme : ${sum}`:game.phase==="deposit"?"Choisissez une tuile à déposer.":mine?"À vous de jouer.":"Votre adversaire joue.";
}

function showResult(){ if(!game.result)return;els.result_title.textContent=game.result.title;els.result_message.textContent=game.result.message;els.continue_button.textContent=game.phase==="round-over"?"Round suivant":game.phase==="match-over"?"Retour au menu":"Continuer";els.result_dialog.showModal(); }
function closeResult(){els.result_dialog.close();}

async function leaveRoom(){
  if(roomId&&db) await db.rpc("lucky21_leave_room",{p_room_id:roomId});
  if(channel) await db.removeChannel(channel);
  location.href="index.html";
}

function setLobbyMessage(message,error=false){
  els.lobby_message.textContent=message;
  els.lobby_message.style.color=error?"var(--danger)":"var(--gold)";
  els.lobby_status.hidden=!message;
  els.scroll_to_game.hidden=error||!message;
}
function friendlyError(error){const message=String(error?.message??error);if(/not found|introuvable/i.test(message))return"Ce salon est introuvable.";if(/full|complet/i.test(message))return"Ce salon possède déjà deux joueurs.";return message;}

els.create_form.addEventListener("submit",createRoom);
els.join_form.addEventListener("submit",joinRoom);
els.room_code.addEventListener("input",()=>{els.room_code.value=els.room_code.value.toUpperCase().replace(/[^A-Z0-9]/g,"");});
els.scroll_to_game.addEventListener("click",()=>els.game.scrollIntoView({behavior:"smooth",block:"start"}));
els.copy_code.addEventListener("click",async()=>{await navigator.clipboard.writeText(roomCode);els.copy_code.textContent="Copié ✓";setTimeout(()=>{els.copy_code.textContent=roomCode;},1200);});
els.leave_button.addEventListener("click",leaveRoom);
els.directions.forEach((button)=>button.addEventListener("click",()=>move(button.dataset.direction)));
els.boost_toggle.addEventListener("change",chooseBoost);
els.take_button.addEventListener("click",takeOrDeposit);
els.pass_button.addEventListener("click",pass);
els.score_button.addEventListener("click",score);
els.deposit_button.addEventListener("click",deposit);
els.close_result.addEventListener("click",closeResult);
els.continue_button.addEventListener("click",()=>{if(["round-over","match-over"].includes(game.phase))startNextRound();else closeResult();});
document.addEventListener("keydown",(event)=>{
  if(event.key!=="Enter"||event.repeat||event.target.closest("input,select,textarea,button,dialog"))return;
  if(!isMyTurn()||!["move","deposit"].includes(game.phase))return;
  event.preventDefault();
  takeOrDeposit();
});

setInterval(()=>{
  if(!game||game.phase!=="memory"){els.memory_countdown.textContent="";return;}
  const remaining=Math.max(0,Math.ceil((game.memoryUntil-Date.now())/1000));els.memory_countdown.textContent=`${remaining}s`;
  if(remaining===0&&game.currentPlayer===seat&&!saving){game.phase="move";game.steps=0;game.limit=game.firstTurn?1:RULES.move;game.turnStart={...game.pawn};render();save();}
},250);

window.addEventListener("beforeunload",()=>{if(channel)db.removeChannel(channel);});
ensureSession().then(()=>{els.sync_label.textContent="Prêt";}).catch((error)=>setLobbyMessage(friendlyError(error),true));
