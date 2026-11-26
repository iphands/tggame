/** The word deck. Things that are fun to doodle and easy to get gloriously wrong. */
import { MAX_ANSWER_WORDS } from './constants.js';

export const WORDS: readonly string[] = `
elephant|giraffe|penguin|octopus|hedgehog|kangaroo|flamingo|jellyfish|crocodile|sloth
unicorn|dragon|mermaid|werewolf|vampire|zombie|ghost|wizard|robot|alien
pirate|ninja|cowboy|astronaut|knight|clown|lumberjack|firefighter|scarecrow|snowman
dinosaur|shark|whale|dolphin|snail|caterpillar|butterfly|ladybug|spider|bee
owl|parrot|peacock|rooster|duck|swan|bat|squirrel|raccoon|skunk
camel|llama|zebra|rhino|hippo|gorilla|panda|koala|walrus|moose
lobster|crab|starfish|seahorse|pufferfish|turtle|frog|chameleon|scorpion|worm
pizza|taco|hamburger|hot dog|spaghetti|sushi|pancakes|waffle|donut|cupcake
popcorn|pretzel|sandwich|burrito|meatball|fried egg|bacon|cheese|pickle|broccoli
banana|pineapple|watermelon|strawberry|avocado|coconut|corn on the cob|pumpkin|mushroom|carrot
ice cream cone|birthday cake|lollipop|cotton candy|milkshake|teapot|coffee mug|lunchbox|gumball machine|cookie jar
bicycle|skateboard|roller skates|unicycle|scooter|motorcycle|tractor|school bus|fire truck|ice cream truck
submarine|sailboat|pirate ship|canoe|helicopter|hot air balloon|rocket|flying saucer|airplane|parachute
train|roller coaster|ferris wheel|carousel|bumper cars|monster truck|bulldozer|tow truck|golf cart|sled
lighthouse|castle|igloo|treehouse|windmill|pyramid|barn|skyscraper|tent|haunted house
volcano|waterfall|rainbow|tornado|iceberg|desert island|cave|beehive|bird nest|campfire
toilet|bathtub|toothbrush|plunger|rubber duck|shower|washing machine|vacuum cleaner|toaster|blender
lamp|umbrella|backpack|suitcase|ladder|wheelbarrow|lawn mower|mailbox|fire hydrant|traffic light
guitar|drum kit|trumpet|piano|accordion|harmonica|violin|bagpipes|saxophone|tuba
telescope|microscope|magnifying glass|compass|treasure map|treasure chest|message in a bottle|crystal ball|magic wand|genie lamp
crown|top hat|cowboy boots|sunglasses|bow tie|flip flops|mittens|scarf|tutu|cape
sword|shield|bow and arrow|catapult|cannon|boomerang|slingshot|lasso|trident|anchor
yo-yo|kite|trampoline|swing set|sandcastle|jack-in-the-box|teddy bear|puppet|rocking horse|piñata
bowling|surfing|skiing|ice skating|fishing|juggling|tightrope walker|sword swallower|limbo|tug of war
hula hoop|pogo stick|karate|ballet|breakdancing|arm wrestling|pillow fight|water balloon fight|snowball fight|sack race
sneeze|hiccups|sunburn|bad hair day|sleepwalking|goosebumps
traffic jam|elevator|escalator|car wash|laundromat|lemonade stand|food truck
dentist|haircut|sunbathing|babysitter|tooth fairy|scuba diver|mountain climber|lion tamer|mad scientist|mail carrier
bookworm|copycat
piggy bank|spilled milk|butterfingers|brainstorm|heartbreak|daydream|nightmare
moonwalk|air guitar|belly flop|cannonball|high five|group hug|selfie|photobomb
bubble bath|belly button|unibrow|mustache|wig
quicksand|black hole|shooting star|eclipse|time machine|bigfoot
loch ness monster|kraken|cyclops|centaur|minotaur|gnome|fairy|leprechaun|troll
chicken nuggets|french fries|mac and cheese|banana split|gingerbread man|candy cane|fortune cookie|jelly bean|marshmallow|s'mores
cactus|palm tree|sunflower|venus flytrap|dandelion|four-leaf clover|bonsai tree|christmas tree|tumbleweed|seaweed
alarm clock|grandfather clock|hourglass|calendar|light bulb|candle|flashlight|lava lamp|disco ball|chandelier
remote control|joystick|headphones|record player|walkie-talkie|megaphone|typewriter|payphone|satellite dish
hammock|bunk bed|sleeping bag|rocking chair|high chair|throne|bean bag|waterbed|trapdoor
ball pit|bouncy castle|water slide|mini golf|go-kart|petting zoo
fart|silent but deadly|whoopee cushion|stink bomb|burp|belch|wedgie
booger|loogie|drool|stinky socks
butt crack|mooning|man bun|mullet
beer belly|cankles|uvula|outie belly button|moobs
porta-potty|clogged toilet|toilet paper mummy|outhouse|bidet|peeing in the pool
dog poop|poop emoji|litter box|bird poop on a car|seagull stealing fries|dog sniffing a butt
puke|hangover|seasick
zit|wart|blister|bunion|hickey|black eye
walk of shame
ugly sweater|socks with sandals|crocs|fanny pack|speedo|mankini|toupee|resting grumpy face
twerking|dabbing|chicken dance|macarena|conga line|crowd surfing
streaker|naked mole rat|hot tub|sauna
caveman on a date|alien abduction|mummy on a treadmill|ghost on the toilet
t-rex doing push-ups|shark in a bathtub|llama with sunglasses|sloth on a skateboard|pigeon in a suit|squirrel with a jetpack|goat on a trampoline|cow in a tutu|chicken crossing the road|cat in a business meeting
hamster wheel of doom|grumpy cat
bigfoot at the beach|dragon with heartburn|mermaid at the dentist|werewolf at the barber|grim reaper on vacation|santa stuck in a chimney|tooth fairy robbery|easter bunny hangover
false teeth in a glass|nose hair trimmer|back scratcher|bedpan|mobility scooter chase|bingo night brawl
banana peel slip|pie in the face|pants on fire|pants falling down|stepping on a rake|stepping on a lego|walking into a glass door|tripping up the stairs|texting into a pole
photocopying your butt|zoom call with no pants|selfie stick|doomscrolling|low battery panic
hot dog eating contest|pizza for breakfast|spaghetti in a pocket|cheese puff fingers|milk out the nose
belly dancer|sumo wrestler|bodybuilder in a thong|jazzercise|sweatband|protein shake explosion
evil clown|creepy doll
tinfoil hat|men in black|time-travelling toddler
bridezilla|awkward family photo|mother-in-law|gender reveal gone wrong
rodeo clown|mime in a box|human cannonball|bearded lady|fire breather|snake charmer|knife thrower|bed of nails
pillow fort|bedhead|snoring
`
  .trim()
  .split(/[|\n]/)
  .map((w) => w.trim())
  .filter(Boolean)
  .filter((w) => w.split(/[\s-]+/).length <= MAX_ANSWER_WORDS);

/** Flavour words Doodlebots sometimes bolt onto their guesses. */
export const BOT_ADJECTIVES: readonly string[] = [
  'angry', 'tiny', 'haunted', 'melting', 'fancy', 'sleepy', 'giant', 'confused', 'spicy', 'wobbly', 'sad', 'radioactive',
];
