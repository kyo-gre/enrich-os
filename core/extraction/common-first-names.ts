/**
 * Bundled, offline list of common English first names used by the email
 * name-order heuristic (core/extraction/email-name-parser.ts). Deliberately
 * static/local rather than an API call — matches the no-cloud-dependency
 * mandate and keeps the heuristic deterministic and testable.
 *
 * Known limitation: skews toward Western/English given names. Names outside
 * this list simply fall through to the "ambiguous" path (first.last default
 * + confidence penalty) rather than a confident wrong guess — see
 * email-name-parser.ts.
 */
const COMMON_FIRST_NAMES = [
  "aaron", "abigail", "adam", "addison", "adrian", "aiden", "alan", "albert",
  "alex", "alexander", "alexandra", "alexis", "alice", "alicia", "allison",
  "amanda", "amber", "amelia", "amy", "andrea", "andrew", "angela", "anita",
  "ann", "anna", "anne", "anthony", "antonio", "april", "arthur", "ashley",
  "aubrey", "audrey", "austin", "autumn", "ava", "barbara", "beatrice",
  "benjamin", "bernard", "beth", "bethany", "betty", "beverly", "bianca",
  "billy", "blake", "bonnie", "brandon", "brandy", "brenda", "brian",
  "brianna", "brittany", "brooke", "bruce", "bryan", "caleb", "cameron",
  "camila", "candice", "carl", "carla", "carlos", "carly", "carmen",
  "carol", "caroline", "carolyn", "carrie", "casey", "catherine", "cathy",
  "cecilia", "chad", "charles", "charlotte", "chelsea", "cheryl", "chloe",
  "chris", "christian", "christina", "christine", "christopher", "cindy",
  "claire", "clara", "clarence", "claudia", "clifford", "colin", "connie",
  "connor", "courtney", "craig", "crystal", "curtis", "cynthia", "dale",
  "dana", "daniel", "danielle", "danny", "david", "dawn", "dean", "deanna",
  "debbie", "deborah", "debra", "denise", "dennis", "derek", "diana",
  "diane", "dominic", "donald", "donna", "doris", "dorothy", "douglas",
  "dylan", "earl", "eddie", "edgar", "edith", "edmund", "eduardo", "edward",
  "edwin", "eileen", "elaine", "eleanor", "elena", "eli", "elijah",
  "elisa", "elizabeth", "ella", "ellen", "elsa", "emerson", "emily", "emma",
  "eric", "erica", "erik", "erika", "erin", "ernest", "esther", "ethan",
  "eugene", "eva", "evan", "evelyn", "faith", "felicia", "fernando",
  "florence", "frances", "francis", "francisco", "frank", "franklin",
  "fred", "frederick", "gabriel", "gabriela", "gabriella", "gail", "gary",
  "gavin", "george", "georgia", "gerald", "geraldine", "gilbert", "gina",
  "gloria", "grace", "grant", "greg", "gregory", "hailey", "hannah",
  "harold", "harry", "heather", "hector", "helen", "henry", "holly",
  "howard", "hunter", "ian", "irene", "isaac", "isabel", "isabella",
  "isabelle", "ivan", "jack", "jackie", "jacob", "jacqueline", "jada",
  "jade", "jaime", "james", "jamie", "jan", "jane", "janet", "janice",
  "jared", "jasmine", "jason", "jay", "jean", "jeff", "jeffrey", "jenna",
  "jennifer", "jenny", "jeremy", "jerome", "jerry", "jessica", "jill",
  "jim", "jimmy", "joan", "joann", "joanna", "joanne", "jocelyn", "jody",
  "joe", "joel", "john", "johnny", "jon", "jonathan", "jordan", "jorge",
  "jose", "joseph", "josephine", "joshua", "joyce", "juan", "judith",
  "judy", "julia", "julian", "julie", "juliet", "june", "justin", "kaitlyn",
  "karen", "kate", "katelyn", "katherine", "kathleen", "kathryn", "kathy",
  "katie", "katrina", "kayla", "keith", "kelley", "kelly", "kelsey",
  "ken", "kendra", "kenneth", "kevin", "kim", "kimberly", "kirk", "kristen",
  "kristin", "kristina", "kyle", "landon", "larry", "laura", "lauren",
  "laurie", "lawrence", "leah", "lee", "leo", "leon", "leonard", "leslie",
  "lewis", "liam", "lillian", "lily", "linda", "lindsay", "lindsey", "lisa",
  "logan", "lois", "lori", "lorraine", "louis", "louise", "lucas", "lucy",
  "luis", "luke", "lydia", "lynn", "madeline", "madison", "manuel", "marc",
  "marcia", "marcus", "margaret", "maria", "marian", "marie", "marilyn",
  "mario", "marion", "marjorie", "mark", "marsha", "martha", "martin",
  "marvin", "mary", "mason", "mateo", "matthew", "maureen", "maurice",
  "max", "maxwell", "maya", "megan", "melanie", "melinda", "melissa",
  "melody", "melvin", "mia", "michael", "michele", "michelle", "miguel",
  "mike", "mildred", "miranda", "molly", "monica", "morgan", "myrtle",
  "nancy", "naomi", "natalie", "natasha", "nathan", "nathaniel", "neil",
  "nell", "nelson", "nevaeh", "nicholas", "nicole", "nina", "noah",
  "noel", "nora", "norma", "norman", "olivia", "oliver", "oscar", "owen",
  "pamela", "patricia", "patrick", "paul", "paula", "pauline", "pedro",
  "peggy", "penelope", "penny", "peter", "philip", "phillip", "phoebe",
  "phyllis", "priscilla", "rachael", "rachel", "ralph", "randall",
  "randy", "raymond", "rebecca", "regina", "renee", "rhonda", "ricardo",
  "richard", "rick", "ricky", "rita", "robert", "roberta", "robin",
  "rodney", "roger", "roland", "ron", "ronald", "ronnie", "rosa", "rose",
  "rosemary", "roy", "ruby", "russell", "ruth", "ryan", "sabrina",
  "sadie", "samantha", "samuel", "sandra", "sara", "sarah", "savannah",
  "scott", "sean", "sebastian", "shane", "shannon", "sharon", "shawn",
  "sheila", "shelby", "shelley", "sherry", "shirley", "sidney", "silvia",
  "simon", "sofia", "sonia", "sophia", "sophie", "stacey", "stacy",
  "stanley", "stephanie", "stephen", "steve", "steven", "stuart", "sue",
  "susan", "suzanne", "sylvia", "tamara", "tammy", "tanya", "tara",
  "taylor", "teresa", "terrence", "terri", "terry", "thelma", "theodore",
  "theresa", "thomas", "tiffany", "tim", "timothy", "tina", "todd", "tom",
  "tommy", "tony", "tracey", "tracy", "travis", "trevor", "tristan",
  "troy", "tyler", "valerie", "vanessa", "vera", "veronica", "vicki",
  "vickie", "victor", "victoria", "vincent", "violet", "virginia",
  "vivian", "walter", "wanda", "warren", "wayne", "wendy", "wesley",
  "william", "willie", "wilma", "winifred", "yolanda", "yvonne",
  "zachary", "zoe",
];

export const commonFirstNamesSet: ReadonlySet<string> = new Set(
  COMMON_FIRST_NAMES,
);

export function isCommonFirstName(token: string): boolean {
  return commonFirstNamesSet.has(token.toLowerCase());
}
