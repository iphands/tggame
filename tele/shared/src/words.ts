/** The word deck. Things that are fun to doodle and easy to get gloriously wrong. */
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
sneeze|hiccups|sunburn|brain freeze|bad hair day|stubbed toe|food coma|sleepwalking|stage fright|goosebumps
traffic jam|elevator|escalator|car wash|drive-thru|laundromat|garage sale|lemonade stand|food truck|parking ticket
dentist|haircut|sunbathing|babysitter|tooth fairy|scuba diver|mountain climber|lion tamer|mad scientist|mail carrier
couch potato|night owl|early bird|bookworm|party animal|copycat|scaredy cat|busy bee|road hog|social butterfly
piggy bank|spilled milk|cold feet|green thumb|sweet tooth|butterfingers|brainstorm|heartbreak|daydream|nightmare
moonwalk|air guitar|belly flop|cannonball|high five|group hug|selfie|photobomb|dad joke|mic drop
bubble bath|bed head|morning breath|bad breath|ear wax|belly button|double chin|unibrow|mustache|wig
quicksand|black hole|shooting star|eclipse|northern lights|meteor shower|time machine|invisible man|crop circle|bigfoot
loch ness monster|abominable snowman|kraken|cyclops|centaur|minotaur|gnome|fairy|leprechaun|troll
chicken nuggets|french fries|mac and cheese|banana split|gingerbread man|candy cane|fortune cookie|jelly bean|marshmallow|s'mores
cactus|palm tree|sunflower|venus flytrap|dandelion|four-leaf clover|bonsai tree|christmas tree|tumbleweed|seaweed
alarm clock|grandfather clock|hourglass|calendar|light bulb|candle|flashlight|lava lamp|disco ball|chandelier
remote control|joystick|headphones|record player|walkie-talkie|megaphone|typewriter|fax machine|payphone|satellite dish
hammock|bunk bed|sleeping bag|rocking chair|high chair|throne|bean bag|waterbed|trapdoor|secret passage
escape room|ball pit|bouncy castle|water slide|lazy river|mini golf|go-kart|laser tag|haunted hayride|petting zoo
`
  .trim()
  .split(/[|\n]/)
  .map((w) => w.trim())
  .filter(Boolean);

/** Flavour words Doodlebots sometimes bolt onto their guesses. */
export const BOT_ADJECTIVES: readonly string[] = [
  'angry', 'tiny', 'haunted', 'melting', 'fancy', 'sleepy', 'giant', 'confused', 'spicy', 'wobbly', 'sad', 'radioactive',
];
