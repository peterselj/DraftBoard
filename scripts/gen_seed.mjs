// One-off generator for src/data/players2025.json
// Source: elboberto's 2025 DefaultAuctionValues tab (Yahoo/ESPN/NFFC avg auction values).
// Positions tagged manually — worth a quick sanity pass.
import { writeFileSync } from "fs";

const RAW = [
  ["Ja'Marr Chase","WR",69,66,59],["Bijan Robinson","RB",67,63,54],["Saquon Barkley","RB",66,63,48],
  ["Jahmyr Gibbs","RB",64,61,52],["Justin Jefferson","WR",60,60,50],["CeeDee Lamb","WR",60,57,51],
  ["Derrick Henry","RB",54,47,38],["Christian McCaffrey","RB",56,55,44],["Nico Collins","WR",53,47,44],
  ["Ashton Jeanty","RB",51,50,42],["Amon-Ra St. Brown","WR",51,53,43],["Puka Nacua","WR",47,51,43],
  ["Malik Nabers","WR",49,51,45],["Brian Thomas Jr.","WR",44,43,44],["De'Von Achane","RB",43,43,40],
  ["Jonathan Taylor","RB",42,41,32],["Josh Jacobs","RB",42,40,33],["Bucky Irving","RB",39,37,36],
  ["Drake London","WR",40,40,43],["Brock Bowers","TE",35,36,32],["A.J. Brown","WR",35,41,33],
  ["Chase Brown","RB",36,36,37],["Kyren Williams","RB",33,31,29],["Ladd McConkey","WR",32,31,37],
  ["Josh Allen","QB",30,37,21],["Lamar Jackson","QB",29,35,22],["Trey McBride","TE",29,31,27],
  ["Tee Higgins","WR",24,30,29],["James Cook","RB",24,28,22],["Jayden Daniels","QB",24,30,17],
  ["George Kittle","TE",24,22,19],["Jaxon Smith-Njigba","WR",23,23,30],["Omarion Hampton","RB",24,25,25],
  ["Tyreek Hill","WR",20,30,27],["Breece Hall","RB",19,15,27],["Mike Evans","WR",19,19,24],
  ["Garrett Wilson","WR",19,19,31],["Jalen Hurts","QB",19,29,14],["Chuba Hubbard","RB",17,19,20],
  ["Marvin Harrison Jr.","WR",17,18,27],["Kenneth Walker III","RB",18,20,23],["Terry McLaurin","WR",16,22,21],
  ["Davante Adams","WR",16,26,25],["Alvin Kamara","RB",16,21,18],["James Conner","RB",15,18,14],
  ["Joe Burrow","QB",13,25,18],["DK Metcalf","WR",11,15,22],["RJ Harvey","RB",11,8,18],
  ["Rashee Rice","WR",9,10,20],["Joe Mixon","RB",8,4,7],["Sam LaPorta","TE",9,11,10],
  ["TreVeyon Henderson","RB",11,19,19],["David Montgomery","RB",8,9,9],["DJ Moore","WR",8,11,21],
  ["DeVonta Smith","WR",9,9,17],["Zay Flowers","WR",8,11,16],["Courtland Sutton","WR",8,11,21],
  ["Isiah Pacheco","RB",8,10,12],["Kaleb Johnson","RB",7,4,9],["D'Andre Swift","RB",7,12,14],
  ["Patrick Mahomes II","QB",7,1,9],["Tony Pollard","RB",8,8,11],["George Pickens","WR",8,9,20],
  ["Xavier Worthy","WR",7,14,21],["Jameson Williams","WR",6,9,20],["Aaron Jones","RB",1,1,9],
  ["Travis Kelce","TE",6,8,8],["Tetairoa McMillan","WR",7,7,21],["Jaylen Waddle","WR",6,8,17],
  ["Travis Hunter","WR",5,7,11],["T.J. Hockenson","TE",5,7,8],["Baker Mayfield","QB",4,10,6],
  ["Calvin Ridley","WR",5,10,20],["Mark Andrews","TE",4,4,6],["Bo Nix","QB",4,8,5],
  ["Chris Godwin","WR",1,4,7],["Quinshon Judkins","RB",4,2,4],["Brian Robinson Jr.","RB",3,1,5],
  ["Tyrone Tracy Jr.","RB",4,5,6],["Chris Olave","WR",3,4,10],["Jordan Mason","RB",3,2,7],
  ["Brandon Aubrey","K",3,3,1],["Travis Etienne Jr.","RB",3,2,7],["Jaylen Warren","RB",3,4,7],
  ["Emeka Egbuka","WR",4,5,12],["Rome Odunze","WR",3,6,10],["J.K. Dobbins","RB",3,3,6],
  ["Evan Engram","TE",3,4,6],["Justin Fields","QB",2,3,4],["Kyler Murray","QB",2,5,3],
  ["Jerry Jeudy","WR",2,7,13],["Brock Purdy","QB",3,5,3],["Ricky Pearsall","WR",3,4,13],
  ["Jordan Addison","WR",2,3,9],["Tyler Warren","TE",3,4,6],["Zach Charbonnet","RB",3,2,6],
  ["Jakobi Meyers","WR",2,4,10],["Cooper Kupp","WR",2,4,5],["David Njoku","TE",2,4,4],
];

const players = RAW.map(([name, pos, yahoo, espn, nffc], i) => ({
  id: `p${i}`,
  name, pos, yahoo, espn, nffc,
  projected: Math.max(1, Math.round((yahoo + espn + nffc) / 3)),
}));

writeFileSync(
  new URL("../src/data/players2025.json", import.meta.url),
  JSON.stringify({ source: "elboberto 2025 DefaultAuctionValues (Yahoo/ESPN/NFFC avg AAV, 10-team standard)", generated: "2026-08-10", players }, null, 2)
);
console.log(`Wrote ${players.length} players.`);
