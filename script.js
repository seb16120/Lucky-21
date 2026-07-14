"use strict";

const RULES = Object.freeze({
  gridSize: 7,
  handLimit: 4,
  normalMove: 3,
  boostedMove: 5,
  firstTurnMove: 1,
  pointsToWinRound: 4,
  roundsToWinMatch: 2,
});

const elements = {
  board: document.querySelector("#board"),
  newMatchButton: document.querySelector("#new-match-button"),
  setupDialog: document.querySelector("#setup-dialog"),
  setupForm: document.querySelector("#setup-form"),
  setupNames: [document.querySelector("#setup-name-0"), document.querySelector("#setup-name-1")],
  memorySeconds: document.querySelector("#memory-seconds"),
  playerNames: [document.querySelector("#player-name-0"), document.querySelector("#player-name-1")],
  playerCards: [document.querySelector("#player-card-0"), document.querySelector("#player-card-1")],
  roundScores: [document.querySelector("#round-score-0"), document.querySelector("#round-score-1")],
  matchScores: [document.querySelector("#match-score-0"), document.querySelector("#match-score-1")],
  boosts: [document.querySelector("#boost-0"), document.querySelector("#boost-1")],
  roundNumber: document.querySelector("#round-number"),
  phaseLabel: document.querySelector("#phase-label"),
  statusTitle: document.querySelector("#status-title"),
  statusMessage: document.querySelector("#status-message"),
  memoryTimer: document.querySelector("#memory-timer"),
  timerValue: document.querySelector("#timer-value"),
  stepsUsed: document.querySelector("#steps-used"),
  stepLimit: document.querySelector("#step-limit"),
  boostToggle: document.querySelector("#boost-toggle"),
  directionButtons: [...document.querySelectorAll("[data-direction]")],
  endMoveButton: document.querySelector("#end-move-button"),
  handTitle: document.querySelector("#hand-title"),
  handCount: document.querySelector("#hand-count"),
  hand: document.querySelector("#hand"),
  selectionHelp: document.querySelector("#selection-help"),
  selectedSum: document.querySelector("#selected-sum"),
  scoreButton: document.querySelector("#score-button"),
  depositButton: document.querySelector("#deposit-button"),
  takeButton: document.querySelector("#take-button"),
  passButton: document.querySelector("#pass-button"),
  messageDialog: document.querySelector("#message-dialog"),
  dialogKicker: document.querySelector("#dialog-kicker"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogMessage: document.querySelector("#dialog-message"),
  dialogButton: document.querySelector("#dialog-button"),
};

const state = {
  players: [createPlayer("Joueur 1"), createPlayer("Joueur 2")],
  board: [],
  pawn: { row: 3, col: 3 },
  currentPlayer: 0,
  roundNumber: 1,
  phase: "idle",
  memorySeconds: 10,
  memoryInterval: null,
  stepsUsed: 0,
  moveLimit: RULES.normalMove,
  usedBoostThisTurn: false,
  firstTurnOfRound: true,
  turnStart: null,
  forbiddenLanding: null,
  selectedHandIds: new Set(),
  afterDialog: null,
};

function createPlayer(name) {
  return {
    name,
    roundScore: 0,
    matchScore: 0,
    boostAvailable: true,
    hand: [],
  };
}

function createDeck() {
  // Composition provisoire : 49 tuiles, valeurs 1 à 11.
  // La distribution exacte peut être remplacée ici sans modifier le reste du jeu.
  const values = [];
  for (let value = 1; value <= 11; value += 1) {
    for (let copy = 0; copy < 4; copy += 1) values.push(value);
  }
  values.push(3, 5, 7, 9, 11);

  const deck = values.map((value, index) => ({
    id: `tile-${cryptoRandomId()}-${index}`,
    value,
    clover: false,
  }));

  // Garantit plusieurs possibilités de 21 entièrement en trèfles.
  const guaranteedCloverValues = [3, 4, 5, 6, 7, 7, 7, 8, 9, 10, 11];
  for (const value of guaranteedCloverValues) {
    const tile = deck.find((candidate) => candidate.value === value && !candidate.clover);
    if (tile) tile.clover = true;
  }

  const remaining = deck.filter((tile) => !tile.clover);
  shuffle(remaining);
  remaining.slice(0, 3).forEach((tile) => { tile.clover = true; });

  return shuffle(deck);
}

function cryptoRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function startMatch(event) {
  event?.preventDefault();

  const names = elements.setupNames.map((input, index) => input.value.trim() || `Joueur ${index + 1}`);
  const memorySeconds = Number.parseInt(elements.memorySeconds.value, 10);

  state.players = names.map(createPlayer);
  state.memorySeconds = Number.isFinite(memorySeconds) ? Math.min(60, Math.max(5, memorySeconds)) : 10;
  state.roundNumber = 1;
  state.currentPlayer = 0;
  elements.setupDialog.close();
  startRound();
}

function startRound() {
  clearInterval(state.memoryInterval);
  state.players.forEach((player) => {
    player.roundScore = 0;
    player.boostAvailable = true;
    player.hand = [];
  });

  const deck = createDeck();
  state.board = Array.from({ length: RULES.gridSize }, (_, row) => (
    Array.from({ length: RULES.gridSize }, (_, col) => ({
      row,
      col,
      tile: deck[(row * RULES.gridSize) + col],
    }))
  ));

  state.pawn = { row: 3, col: 3 };
  state.currentPlayer = (state.roundNumber - 1) % 2;
  state.firstTurnOfRound = true;
  state.forbiddenLanding = null;
  state.selectedHandIds.clear();
  state.phase = "memory";
  beginMemoryCountdown();
  render();
}

function beginMemoryCountdown() {
  let remaining = state.memorySeconds;
  elements.timerValue.textContent = String(remaining);

  state.memoryInterval = setInterval(() => {
    remaining -= 1;
    elements.timerValue.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(state.memoryInterval);
      beginTurn();
    }
  }, 1000);
}

function beginTurn() {
  state.phase = "move";
  state.stepsUsed = 0;
  state.usedBoostThisTurn = false;
  state.moveLimit = state.firstTurnOfRound ? RULES.firstTurnMove : RULES.normalMove;
  state.turnStart = { ...state.pawn };
  state.selectedHandIds.clear();
  elements.boostToggle.checked = false;
  render();
}

function chooseBoost() {
  const player = currentPlayer();
  const wantsBoost = elements.boostToggle.checked;

  if (state.phase !== "move" || state.stepsUsed > 0 || state.firstTurnOfRound || !player.boostAvailable) {
    elements.boostToggle.checked = state.usedBoostThisTurn;
    return;
  }

  state.usedBoostThisTurn = wantsBoost;
  state.moveLimit = wantsBoost ? RULES.boostedMove : RULES.normalMove;
  renderControls();
}

function movePawn(direction) {
  if (state.phase !== "move" || state.stepsUsed >= state.moveLimit) return;

  const deltas = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  const [rowDelta, colDelta] = deltas[direction] ?? [0, 0];
  const next = { row: state.pawn.row + rowDelta, col: state.pawn.col + colDelta };

  if (!isInsideBoard(next.row, next.col)) return;

  state.pawn = next;
  state.stepsUsed += 1;
  render();
}

function isInsideBoard(row, col) {
  return row >= 0 && col >= 0 && row < RULES.gridSize && col < RULES.gridSize;
}

function endMovement() {
  if (state.phase !== "move" || state.stepsUsed < 1) return;

  if (samePosition(state.pawn, state.forbiddenLanding)) {
    setStatus(
      "Destination interdite",
      "Le pion ne peut pas terminer sur la case depuis laquelle l’adversaire l’a déplacé au tour précédent.",
      "Déplacement",
    );
    return;
  }

  if (state.usedBoostThisTurn) currentPlayer().boostAvailable = false;
  state.phase = "action";
  state.selectedHandIds.clear();
  render();
}

function takeTile() {
  if (state.phase !== "action") return;
  const cell = currentCell();
  const player = currentPlayer();

  if (!cell.tile || player.hand.length >= RULES.handLimit) return;

  player.hand.push(cell.tile);
  cell.tile = null;
  state.phase = "resolve";
  state.selectedHandIds.clear();

  if (!hasAnyTwentyOne(player.hand)) {
    finishTurn();
    return;
  }

  render();
}

function toggleHandTile(tileId) {
  if (!new Set(["action", "resolve"]).has(state.phase)) return;

  if (state.selectedHandIds.has(tileId)) {
    state.selectedHandIds.delete(tileId);
  } else {
    const selectionLimit = currentCell().tile === null && state.phase === "action" ? 1 : 3;
    if (state.selectedHandIds.size >= selectionLimit) return;
    state.selectedHandIds.add(tileId);
  }
  renderHand();
  renderControls();
}

function scoreSelectedTiles() {
  if (!new Set(["action", "resolve"]).has(state.phase)) return;
  const player = currentPlayer();
  const selected = selectedTiles();

  if (selected.length !== 3 || selected.reduce((sum, tile) => sum + tile.value, 0) !== 21) return;

  const allSevens = selected.every((tile) => tile.value === 7);
  const allClovers = selected.every((tile) => tile.clover);
  const points = allSevens || allClovers ? 2 : 1;

  player.roundScore += points;
  const selectedIds = new Set(selected.map((tile) => tile.id));
  player.hand = player.hand.filter((tile) => !selectedIds.has(tile.id));
  state.selectedHandIds.clear();

  if (player.roundScore >= RULES.pointsToWinRound) {
    winRound(points);
    return;
  }

  showMessage({
    kicker: `${player.name} marque ${points} point${points > 1 ? "s" : ""}`,
    title: "Lucky 21 !",
    message: allSevens
      ? "Trois tuiles 7 : cette combinaison rapporte 2 points."
      : allClovers
        ? "Trois tuiles trèfle : cette combinaison rapporte 2 points."
        : "La somme vaut 21 : cette combinaison rapporte 1 point.",
    button: "Tour suivant",
    after: finishTurn,
  });
  render();
}

function depositSelectedTile() {
  if (state.phase !== "action" || currentCell().tile !== null || state.selectedHandIds.size !== 1) return;

  const player = currentPlayer();
  const [tileId] = state.selectedHandIds;
  const tileIndex = player.hand.findIndex((tile) => tile.id === tileId);
  if (tileIndex < 0) return;

  const [tile] = player.hand.splice(tileIndex, 1);
  currentCell().tile = tile;
  state.selectedHandIds.clear();
  finishTurn();
}

function passTurn() {
  if (!new Set(["action", "resolve"]).has(state.phase)) return;
  finishTurn();
}

function finishTurn() {
  const previousStart = { ...state.turnStart };
  state.forbiddenLanding = previousStart;
  state.firstTurnOfRound = false;
  state.currentPlayer = 1 - state.currentPlayer;
  beginTurn();
}

function winRound(pointsJustScored) {
  const player = currentPlayer();
  player.matchScore += 1;

  if (player.matchScore >= RULES.roundsToWinMatch) {
    state.phase = "match-over";
    showMessage({
      kicker: `${pointsJustScored} point${pointsJustScored > 1 ? "s" : ""} sur le dernier 21`,
      title: `${player.name} remporte le match !`,
      message: `${player.name} gagne le BO3 avec ${player.matchScore} rounds remportés.`,
      button: "Nouvelle partie",
      after: () => elements.setupDialog.showModal(),
    });
  } else {
    state.phase = "round-over";
    showMessage({
      kicker: `Round ${state.roundNumber} terminé`,
      title: `${player.name} remporte le round`,
      message: "Un nouveau plateau va être généré. Chaque joueur récupérera son déplacement de 5.",
      button: "Round suivant",
      after: () => {
        state.roundNumber += 1;
        startRound();
      },
    });
  }
  render();
}

function showMessage({ kicker, title, message, button, after }) {
  state.afterDialog = after;
  elements.dialogKicker.textContent = kicker;
  elements.dialogTitle.textContent = title;
  elements.dialogMessage.textContent = message;
  elements.dialogButton.textContent = button;
  elements.messageDialog.showModal();
}

function closeMessage() {
  elements.messageDialog.close();
  const callback = state.afterDialog;
  state.afterDialog = null;
  callback?.();
}

function hasAnyTwentyOne(hand) {
  for (let first = 0; first < hand.length - 2; first += 1) {
    for (let second = first + 1; second < hand.length - 1; second += 1) {
      for (let third = second + 1; third < hand.length; third += 1) {
        if (hand[first].value + hand[second].value + hand[third].value === 21) return true;
      }
    }
  }
  return false;
}

function selectedTiles() {
  return currentPlayer().hand.filter((tile) => state.selectedHandIds.has(tile.id));
}

function currentPlayer() {
  return state.players[state.currentPlayer];
}

function currentCell() {
  return state.board[state.pawn.row]?.[state.pawn.col];
}

function samePosition(first, second) {
  return Boolean(first && second && first.row === second.row && first.col === second.col);
}

function render() {
  renderScoreboard();
  renderStatus();
  renderBoard();
  renderHand();
  renderControls();
}

function renderScoreboard() {
  state.players.forEach((player, index) => {
    elements.playerNames[index].textContent = player.name;
    elements.roundScores[index].textContent = String(player.roundScore);
    elements.matchScores[index].textContent = String(player.matchScore);
    elements.boosts[index].textContent = player.boostAvailable ? "disponible" : "utilisé";
    elements.playerCards[index].classList.toggle("player-card-active", index === state.currentPlayer && !new Set(["idle", "memory"]).has(state.phase));
  });
  elements.roundNumber.textContent = String(state.roundNumber);
}

function renderStatus() {
  elements.memoryTimer.hidden = state.phase !== "memory";
  const player = currentPlayer();

  switch (state.phase) {
    case "memory":
      setStatus("Mémorisez le plateau", "Les 49 tuiles seront bientôt retournées face cachée.", "Mémorisation");
      break;
    case "move":
      setStatus(`${player.name} déplace le pion`, `Effectuez de 1 à ${state.moveLimit} pas, puis terminez le déplacement.`, "Déplacement");
      break;
    case "action": {
      const cell = currentCell();
      if (cell.tile) {
        setStatus(`${player.name} est sur une tuile`, player.hand.length < RULES.handLimit ? "Prenez la tuile ou passez votre tour." : "Votre stockage est plein : vous ne pouvez pas prendre cette tuile.", "Action");
      } else {
        setStatus(`${player.name} est sur une case vide`, player.hand.length ? "Sélectionnez une tuile à déposer, ou passez votre tour." : "Vous n’avez aucune tuile à déposer.", "Action");
      }
      break;
    }
    case "resolve":
      setStatus(`${player.name} peut former 21`, "Sélectionnez exactement trois tuiles puis validez la combinaison.", "Résolution");
      break;
    case "round-over":
      setStatus("Round terminé", "Le score du round a atteint 4 points.", "Résultat");
      break;
    case "match-over":
      setStatus("Match terminé", "Un joueur a remporté deux rounds.", "Résultat");
      break;
    default:
      setStatus("Lancez une partie", "Les tuiles seront visibles avant d’être retournées.", "Préparation");
  }
}

function setStatus(title, message, label) {
  elements.statusTitle.textContent = title;
  elements.statusMessage.textContent = message;
  elements.phaseLabel.textContent = label;
}

function renderBoard() {
  elements.board.replaceChildren();

  state.board.flat().forEach((cell) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.setAttribute("role", "gridcell");
    button.dataset.row = String(cell.row);
    button.dataset.col = String(cell.col);

    const current = samePosition(cell, state.pawn);
    const reachable = state.phase === "move" && isAdjacent(cell, state.pawn) && state.stepsUsed < state.moveLimit;
    const forbidden = samePosition(cell, state.forbiddenLanding);

    button.classList.toggle("cell-current", current && new Set(["action", "resolve"]).has(state.phase));
    button.classList.toggle("cell-reachable", reachable);
    button.classList.toggle("cell-forbidden", forbidden && state.phase === "move");
    button.classList.toggle("cell-empty", !cell.tile);
    button.disabled = !reachable;

    if (cell.tile) {
      const tile = document.createElement("span");
      const showFace = state.phase === "memory" || (current && new Set(["action", "resolve"]).has(state.phase));
      tile.className = `tile${showFace ? " tile-visible" : ""}`;
      tile.innerHTML = `<span class="tile-number">${cell.tile.value}</span>${cell.tile.clover ? '<span class="tile-suit" aria-label="trèfle">♣</span>' : ""}`;
      button.append(tile);
      button.setAttribute("aria-label", showFace ? `Tuile ${cell.tile.value}${cell.tile.clover ? " trèfle" : ""}` : "Tuile cachée");
    } else {
      button.setAttribute("aria-label", "Case vide");
    }

    if (current) {
      const pawn = document.createElement("span");
      pawn.className = "pawn";
      pawn.setAttribute("aria-hidden", "true");
      button.append(pawn);
    }

    button.addEventListener("click", () => moveToAdjacentCell(cell.row, cell.col));
    elements.board.append(button);
  });
}

function isAdjacent(first, second) {
  return Math.abs(first.row - second.row) + Math.abs(first.col - second.col) === 1;
}

function moveToAdjacentCell(row, col) {
  const rowDelta = row - state.pawn.row;
  const colDelta = col - state.pawn.col;
  if (rowDelta === -1 && colDelta === 0) movePawn("up");
  if (rowDelta === 1 && colDelta === 0) movePawn("down");
  if (rowDelta === 0 && colDelta === -1) movePawn("left");
  if (rowDelta === 0 && colDelta === 1) movePawn("right");
}

function renderHand() {
  const player = currentPlayer();
  elements.handTitle.textContent = `Stockage de ${player.name}`;
  elements.handCount.textContent = `${player.hand.length}/${RULES.handLimit}`;
  elements.hand.replaceChildren();

  for (let index = 0; index < RULES.handLimit; index += 1) {
    const tile = player.hand[index];
    if (!tile) {
      const placeholder = document.createElement("span");
      placeholder.className = "hand-placeholder";
      elements.hand.append(placeholder);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "hand-tile";
    button.classList.toggle("hand-tile-selected", state.selectedHandIds.has(tile.id));
    button.innerHTML = `<span>${tile.value}</span>${tile.clover ? '<span class="tile-suit" aria-label="trèfle">♣</span>' : ""}`;
    button.setAttribute("aria-pressed", String(state.selectedHandIds.has(tile.id)));
    button.setAttribute("aria-label", `Tuile ${tile.value}${tile.clover ? " trèfle" : ""}`);
    button.addEventListener("click", () => toggleHandTile(tile.id));
    elements.hand.append(button);
  }

  const selected = selectedTiles();
  const sum = selected.reduce((total, tile) => total + tile.value, 0);
  elements.selectedSum.textContent = String(sum);

  if (state.phase === "action" && currentCell()?.tile === null) {
    elements.selectionHelp.textContent = "Sélectionnez une tuile à déposer sur cette case vide.";
  } else if (state.phase === "resolve") {
    elements.selectionHelp.textContent = "Sélectionnez trois tuiles dont la somme vaut 21.";
  } else {
    elements.selectionHelp.textContent = "Les combinaisons de trois tuiles sont évaluées dans votre stockage.";
  }
}

function renderControls() {
  const player = currentPlayer();
  const cell = currentCell();
  const selected = selectedTiles();
  const selectedSum = selected.reduce((sum, tile) => sum + tile.value, 0);
  const movePhase = state.phase === "move";
  const actionPhase = state.phase === "action";

  elements.stepsUsed.textContent = String(state.stepsUsed);
  elements.stepLimit.textContent = String(state.moveLimit);

  elements.boostToggle.disabled = !movePhase || state.stepsUsed > 0 || state.firstTurnOfRound || !player.boostAvailable;
  elements.boostToggle.checked = state.usedBoostThisTurn;

  elements.directionButtons.forEach((button) => {
    const direction = button.dataset.direction;
    button.disabled = !movePhase || state.stepsUsed >= state.moveLimit || !canMoveDirection(direction);
  });

  elements.endMoveButton.disabled = !movePhase || state.stepsUsed < 1;
  elements.takeButton.hidden = !actionPhase || !cell?.tile;
  elements.takeButton.disabled = !actionPhase || !cell?.tile || player.hand.length >= RULES.handLimit;
  elements.depositButton.hidden = !(actionPhase && cell?.tile === null);
  elements.depositButton.disabled = !(actionPhase && cell?.tile === null && state.selectedHandIds.size === 1);
  elements.passButton.disabled = !new Set(["action", "resolve"]).has(state.phase);
  elements.scoreButton.hidden = state.phase !== "resolve";
  elements.scoreButton.disabled = !(state.phase === "resolve" && selected.length === 3 && selectedSum === 21);
}

function canMoveDirection(direction) {
  const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const [rowDelta, colDelta] = deltas[direction] ?? [0, 0];
  return isInsideBoard(state.pawn.row + rowDelta, state.pawn.col + colDelta);
}

function handleKeyboard(event) {
  if (state.phase !== "move") return;
  const keyMap = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  const direction = keyMap[event.key];
  if (!direction) return;
  event.preventDefault();
  movePawn(direction);
}

elements.setupForm.addEventListener("submit", startMatch);
elements.newMatchButton.addEventListener("click", () => elements.setupDialog.showModal());
elements.boostToggle.addEventListener("change", chooseBoost);
elements.directionButtons.forEach((button) => button.addEventListener("click", () => movePawn(button.dataset.direction)));
elements.endMoveButton.addEventListener("click", endMovement);
elements.takeButton.addEventListener("click", takeTile);
elements.depositButton.addEventListener("click", depositSelectedTile);
elements.scoreButton.addEventListener("click", scoreSelectedTiles);
elements.passButton.addEventListener("click", passTurn);
elements.dialogButton.addEventListener("click", closeMessage);
document.addEventListener("keydown", handleKeyboard);

elements.setupDialog.addEventListener("cancel", (event) => {
  if (state.phase === "idle") event.preventDefault();
});

elements.setupDialog.showModal();
render();
