//################################
// PARAMETERS
// Contains Parameters to change the playstile of the bot. Usually no need to change anything.
//################################

/* PERFORMANCE MODE
* Range 0 to 4. Decrease calculation time at the cost of efficiency (2 equals the time of ai version 1.2.1 and before).
* 4 = Highest Precision and Calculation Time. 0 = Lowest Precision and Calculation Time.
* Note: The bot will automatically decrease the performance mode when it approaches the time limit.
* Note 2: Firefox is usually able to run the script faster than Chrome.
*/
export var PERFORMANCE_MODE = 3;

//HAND EVALUATION CONSTANTS
export var EFFICIENCY = 1.0; // Lower: Slower and more expensive hands. Higher: Faster and cheaper hands. Default: 1.0, Minimum: 0
export var SAFETY = 1.0; // Lower: The bot will not pay much attention to safety. Higher: The bot will try to play safer. Default: 1.0, Minimum: 0
export var SAKIGIRI = 1.0; //Lower: Don't place much importance on Sakigiri. Higher: Try to Sakigiri more often. Default: 1.0, Minimum: 0

//CALL CONSTANTS
export var CALL_PON_CHI = 1.0; //Lower: Call Pon/Chi less often. Higher: Call Pon/Chi more often. Default: 1.0, Minimum: 0
export var CALL_KAN = 1.0; //Lower: Call Kan less often. Higher: Call Kan more often. Default: 1.0, Minimum: 0

//STRATEGY CONSTANTS
export var RIICHI = 1.0; //Lower: Call Riichi less often. Higher: Call Riichi more often. Default: 1.0, Minimum: 0
export var CHIITOITSU = 5; //Number of Pairs in Hand to go for chiitoitsu. Default: 5
export var THIRTEEN_ORPHANS = 10; //Number of Honor/Terminals in hand to go for 13 orphans. Default: 10
export var KEEP_SAFETILE = false; //If set to true the bot will keep 1 safetile

//MISC
export var MARK_TSUMOGIRI = false; // Mark the tsumogiri tiles of opponents with grey color
export var CHANGE_RECOMMEND_TILE_COLOR = true; // change recommended tile color in help mode
export var USE_EMOJI = true; //use EMOJI to show tile
export var LOG_AMOUNT = 3; //Amount of Messages to log for Tile Priorities
export var DEBUG_BUTTON = false; //Display a Debug Button in the GUI



//### GLOBAL VARIABLES DO NOT CHANGE ###
export var run = false; //Is the bot running
export var threadIsRunning = false;
export const AIMODE = { //ENUM of AI mode
	AUTO: 0,
	HELP: 1,
} as const;
export const AIMODE_NAME = [ //Name of AI mode
	"Auto",
	"Help",
] as const;
export enum STRATEGIES { //ENUM of strategies
	GENERAL = 'General',
	CHIITOITSU = 'Chiitoitsu',
	FOLD = 'Fold',
	THIRTEEN_ORPHANS = 'Thirteen_Orphans'
};

export interface Tile {
    index: number;
    type: number;
    dora?: boolean;
    doraValue?: number;
    valid?: boolean;
    from?: number;
    kan?: boolean;
    old?: boolean;
    numberOfPlayerHandChanges?: number[];
}

export var strategy = STRATEGIES.GENERAL; //Current strategy
export var strategyAllowsCalls = true; //Does the current strategy allow calls?
export var isClosed = true; //Is own hand closed?
export var dora: Tile[] = []; //Array of Tiles (index, type, dora)
export var ownHand: Tile[] = []; //index, type, dora
export var discards: Tile[][] = []; //Later: Change to array for each player
export var calls: Tile[][]  = []; //Calls/Melds of each player
export var availableTiles: Tile[] = []; //Tiles that are available
export var seatWind = 1; //1: East,... 4: North
export var roundWind = 1; //1: East,... 4: North
export var tilesLeft = 0; //tileCounter
export var visibleTiles: Tile[] = []; //Tiles that are visible
export var errorCounter = 0; //Counter to check if bot is working
export var lastTilesLeft = 0; //Counter to check if bot is working
export var isConsideringCall = false;
export var riichiTiles: (Tile | null)[] = [null, null, null, null]; // Track players discarded tiles on riichi
export var functionsExtended = false;
export var playerDiscardSafetyList: number[][] = [[], [], [], []];
export var timeSave = 0;
export var showingStrategy = false; //Current in own turn?

// Display
export var tileEmojiList = [
	["red🀝", "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡"],
	["red🀋", "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏"],
	["red🀔", "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘"],
	["", "🀀", "🀁", "🀂", "🀃", "🀆", "🀅", "🀄"]];


//LOCAL STORAGE
export var AUTORUN = window.localStorage.getItem("alphajongAutorun") == "true";

export var ROOM = 1;
export var MODE = AIMODE.AUTO;


class AlphaJong {
	
}