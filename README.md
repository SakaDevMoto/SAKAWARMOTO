# Last Zone Royale

Prot&oacute;tipo de battle royale top-down para at&eacute; 10 jogadores, feito em HTML/CSS/JS puro para publicar direto no GitHub Pages com multiplayer via Playroom Kit.

## O que ja vem no projeto

- Lobby com criar sala, entrar por c&oacute;digo e iniciar partida
- 4 classes de arma, cada uma com disparo principal e 3 habilidades
- Zona de tempestade com encolhimento autom&aacute;tico
- Efeitos visuais procedurais no canvas
- Efeitos sonoros sintetizados via Web Audio, sem arquivos externos obrigat&oacute;rios
- Multiplayer hospedado pelo Playroom, sem Firebase ou backend pr&oacute;prio

## Classes

- `Tempest Rifle`: Flash Step, Pulse Mine, Overclock
- `Ember Shotgun`: Breach Slam, Barrier Shell, Dragon Roar
- `Phantom Sniper`: Ghost Veil, Recon Beacon, Pierce Line
- `Volt Launcher`: Arc Dash, Gravity Well, Storm Core

## Rodando localmente

Como o projeto &eacute; est&aacute;tico, basta abrir o `index.html` num navegador moderno. Para comportamento mais pr&oacute;ximo do GitHub Pages, vale servir a pasta com um servidor local simples.

## Publicando no GitHub Pages

1. Coloque estes arquivos em um reposit&oacute;rio.
2. No GitHub, abra `Settings > Pages`.
3. Em `Build and deployment`, selecione a branch e a pasta raiz.
4. Salve. O front-end ficar&aacute; online no GitHub Pages.

## Habilitando o multiplayer online real

GitHub Pages hospeda apenas front-end est&aacute;tico. Para a sincroniza&ccedil;&atilde;o online, este projeto usa `Playroom Kit`, que j&aacute; entrega salas, c&oacute;digos e estado compartilhado.

### 1. Pegue o `gameId` do Playroom

- Crie ou abra seu jogo no portal do Playroom
- Copie o `gameId`

### 2. Preencha o `playroom.config.js`

```js
window.LAST_ZONE_CONFIG = {
  playroomGameId: "SEU_GAME_ID",
  maxPlayersPerRoom: 10,
  reconnectGracePeriodMs: 15000,
  roomBaseUrl: "",
};
```

### 3. Publique normalmente no GitHub Pages

Nao precisa subir banco nem backend adicional.

## Arquivos principais

- `index.html`: layout e HUD
- `style.css`: visual da interface
- `script.js`: integra UI, rede e jogo
- `js/game.js`: loop do jogo, combate, VFX e HUD
- `js/network.js`: Playroom, sincroniza&ccedil;&atilde;o do host e RPCs
- `js/audio.js`: SFX sintetizados
- `playroom.config.js`: configura&ccedil;&atilde;o do Playroom

## Observacoes

- O movimento &eacute; responsivo no cliente, enquanto o host do Playroom resolve tiros, dano, habilidades e vencedor.
- Para um jogo competitivo de verdade, o ideal continua sendo migrar a autoridade completa do combate para backend dedicado.
