// Master data shipped with the app. Characters added or edited in the app live in the SQLite file.
// Days: 0=日 1=月 2=火 3=水 4=木 5=金 6=土. Sunday is always open, so it is added automatically.
window.GT_DATA = {
  // Talent book series → weekdays and domain. Only series confirmed against guides are listed;
  // anything else can be entered by hand when adding a character.
  books: [
    { book: '自由', days: [1, 4], dom: '忘却の峡谷（モンド）' },
    { book: '抗争', days: [2, 5], dom: '忘却の峡谷（モンド）' },
    { book: '詩文', days: [3, 6], dom: '忘却の峡谷（モンド）' },
    { book: '繁栄', days: [1, 4], dom: '太山府（璃月）' },
    { book: '勤労', days: [2, 5], dom: '太山府（璃月）' },
    { book: '黄金', days: [3, 6], dom: '太山府（璃月）' },
    { book: '浮世', days: [1, 4], dom: '菫色ノ庭（稲妻）' },
    { book: '風雅', days: [2, 5], dom: '菫色ノ庭（稲妻）' },
    { book: '天光', days: [3, 6], dom: '菫色ノ庭（稲妻）' },
    { book: '忠言', days: [1, 4], dom: 'スメールの天賦秘境' },
    { book: '創意', days: [2, 5], dom: 'スメールの天賦秘境' },
    { book: '篤行', days: [3, 6], dom: 'スメールの天賦秘境' },
    { book: '公平', days: [1, 4], dom: '蒼白の遺栄（フォンテーヌ）' },
    { book: '正義', days: [2, 5], dom: '蒼白の遺栄（フォンテーヌ）' },
    { book: '秩序', days: [3, 6], dom: '蒼白の遺栄（フォンテーヌ）' },
    { book: '角逐', days: [1, 4], dom: '秘炎の幽墟（ナタ）' },
    { book: '焚燼', days: [2, 5], dom: '秘炎の幽墟（ナタ）' },
    { book: '紛争', days: [3, 6], dom: '秘炎の幽墟（ナタ）' },
    { book: '楽園', days: [2, 5], dom: '光なき深都（ナド・クライ）' },
    { book: '不屈', days: [2, 5], dom: '荒れ果てた聖跡（スネージナヤ）' }
  ],
  // Preset characters. Sources: Game8 / GameWith / アルテマ material pages (Oct 2026).
  presets: [
    { id: 'skirk', name: 'スカーク', book: '角逐', boss: '深遠なるミミックパピラ', weekly: '扉に通ずる対局', wmat: '昇揚のサンプル「ナイト」',
      sp: '岩裂の花', spArea: 'ナタ・アトクパンの大地', enemy: 'クロックワーク・マシナリー', enemyArea: 'フォンテーヌ',
      art: '深廊の終曲', artDom: '荒れ果てた創造の地（ナタ）', artNote: '深廊の終曲4。会心と攻撃力', tal: '通常・スキル・爆発すべて', tgt: [9, 9, 9] },
    { id: 'escoffier', name: 'エスコフィエ', book: '正義', boss: '秘源機兵・統御デバイス', weekly: '', wmat: '蝕滅の焔角',
      sp: '蒼晶螺', spArea: 'フォンテーヌの水中', enemy: 'クロックワーク・マシナリー', enemyArea: 'フォンテーヌ',
      art: '旧貴族のしつけ', artDom: '華池岩岫（璃月）', artNote: '旧貴族4（フリーナが劇団でない場合は黄金の劇団も可）', tal: 'スキル ＞ 爆発（通常は不要）', tgt: [1, 9, 9] },
    { id: 'vodyanitsa', name: 'ヴォジャニーツァ', book: '不屈', boss: '不滅の副産物', weekly: '「博士」', wmat: '狂人の誓約',
      sp: 'フロストフラワー', spArea: 'スネージナヤ', enemy: '合成獣', enemyArea: 'スネージナヤ',
      art: '千岩牢固', artDom: '山脊の見守り（モンド）', artNote: '千岩4。時計・杯・冠はHP%、HP6万以上が目安', tal: 'スキル ＞ 爆発 ＞ 通常', tgt: [1, 9, 9] },
    { id: 'durin', name: 'ドゥリン', book: '詩文', boss: '重量級陸巡艦「バトルシップ」', weekly: '蝕まれし源焔の主', wmat: '蝕滅の陽炎',
      sp: 'フロストランプ', spArea: 'ナド・クライ', enemy: 'ファデュイ特務隊', enemyArea: 'ナド・クライ',
      art: '旧貴族のしつけ', artDom: '華池岩岫（璃月）', artNote: '旧貴族4。杯は炎ダメージ、冠は会心', tal: '爆発 ＞ スキル ＞ 通常', tgt: [1, 9, 9] },
    { id: 'nicole', name: 'ニコ', book: '楽園', boss: '昏き魘夢の主', weekly: '左道の真諦者', wmat: '偽りの樹脂',
      sp: '琥珀香', spArea: 'ナド・クライ・厄影の沼地', enemy: 'ファデュイ特務隊', enemyArea: 'ナド・クライ',
      art: '天からの贈り物', artDom: '山風の荊冠（モンド）', artNote: '天からの贈り物4。攻撃力メイン、攻撃力4000が目標', tal: 'スキル ＞ 爆発 ＞ 通常', tgt: [1, 9, 9] }
  ],
  // A ready-made team that can be added in one tap from the empty state.
  starterTeam: { name: 'スカーク凍結（＋ドゥリン・ニコ）', ids: ['skirk', 'escoffier', 'vodyanitsa', 'durin', 'nicole'], team: { skirk: 1, escoffier: 1, vodyanitsa: 1, durin: 2, nicole: 2 } }
};
