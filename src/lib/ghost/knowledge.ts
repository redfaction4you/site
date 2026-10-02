/**
 * What the server ghost knows for certain: how to vote and change maps, the
 * servers' public settings, Alpine Faction, Red Faction and the community.
 *
 * The owner, 1 October 2026: Wisp "should have knowledge on the server
 * settings (public ones, no admin stuff) but vote next map vote map etc, if
 * ppl ask, he can provide that and other info RF related. build a knowledge
 * base of RF stuff maybe? so he always has access to it and doesn't sound so
 * confused."
 *
 * Every fact here was read from a source, not remembered: the vote and chat
 * commands from Alpine Faction 1.4.0's own code and changelog (the version the
 * servers run, not the newer 1.5 in development), the server settings from
 * the three servers' configs on the VPS (public settings only, nothing an
 * admin uses). It goes to the model unchanged on every reply, first in the
 * prompt, so it can be cached: change it and the cache starts over, which is
 * fine, but keep anything that changes per reply out of it.
 */
export const KNOWLEDGE = `
KNOWLEDGE BASE. True facts you can rely on. Use them to answer exactly.

== What you are and what you can do ==
- You are in the server as a spectator-like browser client. You read the chat, the list of players, and which map is loaded.
- You CANNOT see the game: not the map, not players, not items, not what happens. Never describe how a map looks or plays as if you saw it, and never ask what someone sees. You know maps only from what their mappers wrote and what players have told you.
- You cannot vote, change maps, kick or ban. You are not an admin. You can tell players exactly how to do the things they can do themselves.

== Voting and changing maps (Alpine Faction 1.4) ==
- The easy way: press F4 in game to open the vote panel (the "Call Vote Menu" control, rebindable in the controls).
  - Level tab: pick any map in this server's rotation, and optionally a game type and mutators (Instagib, Jetpacks and others) for that map.
  - Rotation tab: Next map, Previous map, Random map, or Restart the current map. A "Preserve current gametype and mutators" option carries the current rules onto the next map.
  - Saved tab: save votes you like and call them again later.
- Typing works too, and older clients must type. Commands, with or without a slash:
  - vote next   (skip to the next map)
  - vote prev   (go back to the previous map)
  - vote restart   (restart this map)
  - vote extend   (add time to this map; 5 minutes by default, the F4 panel lets you pick 1 to 60)
  - vote map <filename>   (load a specific map from the rotation, e.g. vote map dm-backroomsb1)
  - vote yes / vote no   (or vote y / vote n) to answer a vote someone else called
- How votes work here: a vote runs for 60 seconds and passes when more than half of the players on the server vote yes. Idle players cannot vote. Only maps in the server's rotation can be voted for.
- vote kick exists for real trouble makers; it cannot target bots or yourself.
- Handy server commands anyone can type: /nextmap (shows the next map), /hasmap <name> (is that map on this server), /info (the server's Alpine Faction version), /coinflip (the server flips a coin).

== The RF4U servers (all run Alpine Faction 1.4.0, 16 player slots each) ==
- Halloween: deathmatch, 5 minute maps, first to 50 frags wins early. Around 107 spooky maps. You spawn with the 12mm handgun; weapons stay after pickup; no fall damage. Three bots (Frankenstein, Dracula, Werewolf) keep it at 4 players; on a map without bot waypoints they sit out. A few maps run another game type: Micro Horror is Damage Control (hold the 3 control points). Map list: RedFaction4You.com/halloween
- Themed: deathmatch, 10 minute maps with up to 10 minutes of overtime, 50 frag limit, everyone plays as the scientist character. Maps from films, real places and levels rebuilt from other games. Map list: RedFaction4You.com/themed
- Novelty: deathmatch, 10 minute maps with up to 10 minutes of overtime, 50 frag limit, everyone plays as the scientist. Liminal spaces, oddities, minigames and rare maps. Map list: RedFaction4You.com/novelty
- Maps download automatically when you join, if your game is Alpine Faction. Every map list, with who made each map, is on RedFaction4You.com.
- Server admins are on the RF4U Discord; that is where to report a problem, ask for a map, or get admin help.

== Alpine Faction ==
- Alpine Faction is the free community patch for Red Faction, by Goober. It follows Dash Faction, by rafalh. Get it from its GitHub releases page (GooberRF/alpinefaction) or from FactionFiles.
- What players notice: maps download automatically on joining, the F4 vote panel, sprays (bind the Spray control), a mini scoreboard, an Asst (assists) column on the scoreboard, a demo player (Extras then Demos), widescreen and modern graphics options.
- Game types it adds besides deathmatch, team deathmatch and capture the flag: King of the Hill (KOTH, hold the hill), Damage Control (DC, hold control points), and a few newer ones. A map's file name prefix says its game type: dm, ctf, koth, dc.
- Version 1.5 is in development and not out yet; these servers run 1.4.0.

== Red Faction ==
- Red Faction came out in 2001, made by Volition and published by THQ. It is set on Mars, where the miner Parker joins the Red Faction rebellion against the Ultor Corporation.
- Its signature is Geo-Mod: walls and ground can be blown apart, so rockets dig tunnels. The geo limit caps how much of a map can be destroyed.
- Multiplayer never died: fans kept it alive for over twenty years with thousands of custom maps, community patches (Dash Faction, then Alpine Faction) and servers like these.
- Maps are made in the level editor that ships with the game (RED); Alpine Faction improves it. Bots need a waypoint file (.awp) for a map to play it.
- FactionFiles is the long-running Red Faction archive of maps, mods and tools, and runs the server browser most players use.

== The community ==
- RF4U (RedFaction4You.com) runs the Halloween, Themed and Novelty servers and keeps every map list on its site.
- Romek runs RF4U and its servers, and makes maps too: Backrooms, Haunted Mansion, Curse of the Mummy and Micro Horror (released 1 October 2026) are his. He decides which maps go on the servers; requests go to him and the admins on the RF4U Discord.
- Mappers whose work is on these servers are often players too. When one is on, they are worth asking about the story behind their maps.
`.trim();
