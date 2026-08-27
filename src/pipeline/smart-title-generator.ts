// 题材词表：按题材分组，用于题材一致性校验和质量评分
import {
  generateContentDrivenTitle,
  type ExtractedEntities,
} from './content-driven-title-generator.js';

const GENRE_KEYWORDS: Record<string, string[]> = {
  xuanhuan: [
    '修炼', '突破', '筑基', '结丹', '元婴', '化神', '渡劫', '飞升',
    '宗门', '门派', '家族', '势力', '门阀', '世家', '皇朝', '帝国',
    '秘境', '禁地', '遗迹', '洞府', '仙府', '魔窟', '妖巢',
    '功法', '秘籍', '神诀', '仙诀', '魔功', '妖术', '神通',
    '剑', '刀', '枪', '戟', '斧', '弓', '箭', '鞭', '棍',
    '丹', '药', '符', '阵', '器', '炼', '铸', '刻',
    '灵气', '灵力', '真气', '斗气', '魔力', '妖气', '仙力',
    '天', '地', '人', '神', '魔', '妖', '鬼', '佛', '道',
    '城', '山', '谷', '洞', '府', '阁', '殿', '宗', '门', '派',
    '岛', '湖', '海', '河', '渊', '崖', '峰', '岭', '原', '林',
    '反杀', '逆袭', '打脸', '碾压', '夺宝', '复仇', '争霸', '封神',
  ],
  xianxia: [
    '修仙', '修真', '悟道', '飞升', '成仙', '成神', '证道', '渡劫',
    '元婴', '化神', '炼虚', '合体', '大乘', '仙人', '天仙', '金仙',
    '天庭', '地府', '神界', '仙界', '魔界', '妖界', '鬼界',
    '剑仙', '丹仙', '符仙', '阵仙', '器仙', '医仙', '毒仙',
    '太上', '元始', '通天', '女娲', '伏羲', '神农', '黄帝',
    '昆仑山', '蓬莱', '方丈', '瀛洲', '蜀山', '罗浮', '终南',
    '金丹', '元婴', '元神', '识海', '丹田', '经脉', '窍穴',
    '天劫', '心魔', '雷劫', '火劫', '情劫', '杀劫',
    '天书', '地书', '人书', '仙书', '魔典', '妖经', '佛卷',
    '斩', '灭', '破', '夺', '救', '逃', '闯', '渡',
  ],
  urban: [
    '职场', '商业', '投资', '创业', '公司', '集团', '企业', '上市',
    '项目', '合同', '预算', '报表', '会议', '谈判', '并购', '融资',
    '总裁', '经理', '总监', 'CEO', 'CTO', '股东', '董事', '员工',
    '外卖', '快递', '直播', '电商', '网红', '流量', '粉丝',
    '系统', '软件', '算法', '数据', '代码', '开发', '产品', '设计',
    '校园', '大学', '学霸', '学渣', '考试', '竞赛', '导师', '同学',
    '豪门', '家族', '继承人', '私生子', '契约', '婚姻', '恋爱',
    '破案', '侦探', '悬疑', '真相', '秘密', '阴谋', '陷害', '洗白',
  ],
  romance: [
    '恋爱', '婚姻', '契约', '宠', '甜', '虐', '恋', '情',
    '女主', '男主', '女配', '男配', '备胎', '渣', '白月光', '朱砂痣',
    '重生', '穿越', '快穿', '系统', '空间', '异能',
    '误会', '和解', '重逢', '离别', '暗恋', '表白', '求婚',
    '总裁', '霸总', '影帝', '影后', '明星', '偶像', '粉丝',
    '古代', '王妃', '皇后', '贵妃', '公主', '王爷', '太子', '皇帝',
    '校园', '学长', '学妹', '学霸', '校草', '校花',
    '都市', '豪门', '家族', '继承人', '契约婚姻', '先婚后爱',
  ],
  postapocalyptic: [
    '末世', '末日', '灾难', '病毒', '丧尸', '变异', '进化',
    '基地', '堡垒', '避难所', '聚集地', '安全区', '禁区',
    '物资', '资源', '食物', '水', '武器', '弹药', '药品',
    '进化', '变异', '能力', '异能', '觉醒', '突破', '升级',
    '猎杀', '生存', '逃亡', '战斗', '防御', '进攻',
    '废土', '废墟', '荒原', '沙漠', '冰原', '辐射区',
    '势力', '联盟', '军团', '小队', '猎人', '佣兵', '商人',
  ],
  'sci-fi': [
    '星际', '宇宙', '飞船', '空间站', '星球', '星系', '黑洞',
    '科技', '人工智能', '机器人', '纳米', '量子', '基因',
    '机甲', '战舰', '武器', '护盾', '能源', '引擎',
    '文明', '外星', '异形', '虫族', '帝国', '联盟', '联邦',
    '穿越', '重生', '系统', '空间', '时间', '维度',
    '探险', '战斗', '生存', '逃亡', '复仇', '争霸',
  ],
  suspense: [
    '悬疑', '推理', '破案', '侦探', '真相', '秘密', '命案', '谋杀',
    '凶手', '嫌疑人', '证据', '线索', '推理', '逻辑', '分析',
    '密室', '孤岛', '连环', '失踪', '绑架', '勒索', '欺诈',
    '阴谋', '陷阱', '反转', '意外', '巧合', '伪装', '误导',
    '刑警', '法医', '律师', '记者', '卧底', '杀手', '间谍',
    '夜晚', '雨夜', '黑暗', '迷雾', '阴影', '灯光', '血迹',
  ],
  horror: [
    '惊悚', '恐怖', '鬼', '怪', '僵尸', '丧尸', '怪物', '恶灵',
    '诅咒', '封印', '献祭', '附身', '亡魂', '怨灵', '幽灵',
    '墓地', '鬼屋', '废墟', '森林', '山洞', '地下室', '废弃',
    '尖叫', '恐惧', '颤抖', '逃跑', '躲藏', '求救', '死亡',
    '血', '尸体', '腐烂', '噩梦', '幻觉', '灵异', '超自然',
  ],
  game: [
    '游戏', '系统', '网游', '电竞', '玩家', 'NPC', 'BOSS', '副本',
    '技能', '装备', '升级', '任务', '公会', '排行榜', '竞技场',
    '职业', '天赋', '属性', '经验', '金币', '钻石', '道具',
    '虚拟', '现实', '穿越', '重生', '数据流', '无限流',
    '战斗', 'PK', '团战', '攻略', '技巧', '操作', '意识',
  ],
  sports: [
    '篮球', '足球', '电竞', '联赛', '比赛', '训练', '教练', '球员',
    '球队', '冠军', 'MVP', '得分', '助攻', '篮板', '抢断',
    '射门', '进球', '防守', '进攻', '战术', '配合', '突破',
    '伤病', '康复', '转会', '签约', '退役', '复出', '传奇',
    '热血', '拼搏', '梦想', '荣耀', '巅峰', '超越', '逆袭',
  ],
  history: [
    '历史', '古代', '王朝', '皇帝', '将军', '谋士', '权臣', '名将',
    '战争', '战役', '策略', '权谋', '政治', '外交', '贸易',
    '科举', '官场', '江湖', '门派', '世家', '宗族', '部落',
    '城池', '堡垒', '关隘', '边疆', '草原', '沙漠', '海域',
    '改革', '变法', '起义', '叛乱', '统一', '分裂', '兴亡',
    '战场', '沙场', '营帐', '军旗', '战鼓', '号角', '刀剑',
    '弓箭', '铁骑', '步兵', '骑兵', '弓箭', '长枪', '盾牌',
    '火光', '烽火', '狼烟', '旌旗', '铠甲', '战袍', '战马',
    '下令', '出征', '征战', '退兵', '突围', '坚守', '突袭',
    '伏击', '攻城', '守城', '撤军', '议和', '结盟', '背叛',
  ],
  military: [
    '军事', '战争', '战场', '军队', '部队', '士兵', '军官', '将军',
    '武器', '装备', '弹药', '炮弹', '导弹', '坦克', '战机', '战舰',
    '训练', '演习', '任务', '作战', '战斗', '冲锋', '撤退', '坚守',
    '突围', '伏击', '侦察', '情报', '密码', '特种', '精英', '王牌',
    '勋章', '军衔', '功勋', '战功', '战绩', '牺牲', '荣誉', '使命',
    '战友', '兄弟', '忠诚', '背叛', '复仇', '守护', '救援', '撤退',
    '阵地', '防线', '碉堡', '工事', '战壕', '雷区', '禁区', '据点',
  ],
  campus: [
    '校园', '大学', '高中', '初中', '小学', '班级', '宿舍', '食堂',
    '学霸', '学渣', '学神', '校草', '校花', '学长', '学姐', '学弟',
    '老师', '教授', '辅导员', '班主任', '校长', '同学', '室友', '同桌',
    '考试', '高考', '考研', '竞赛', '论文', '答辩', '毕业', '开学',
    '社团', '学生会', '篮球队', '足球队', '啦啦队', '文艺部', '体育部',
    '暗恋', '初恋', '表白', '情书', '约会', '牵手', '拥抱', '初吻',
    '青春', '梦想', '奋斗', '拼搏', '迷茫', '成长', '友谊', '回忆',
    '模拟考', '月考', '期中考', '期末考', '一模', '二模', '三模', '冲刺',
    '逆袭', '保送', '录取', '奖学金', '补课', '刷题', '背书', '自习',
  ],
  entertainment: [
    '娱乐圈', '影视', '明星', '演员', '歌手', '偶像', '网红', '主播',
    '导演', '编剧', '制片人', '经纪人', '助理', '粉丝', '狗仔', '媒体',
    '影帝', '影后', '视帝', '视后', '歌神', '歌后', '天王', '天后',
    '选秀', '综艺', '真人秀', '访谈', '颁奖', '红毯', '首映', '发布会',
    '拍戏', '剧组', '片场', '杀青', '上映', '票房', '收视率', '热度',
    '绯闻', '恋情', '官宣', '分手', '离婚', '结婚', '怀孕', '生子',
    '逆袭', '爆红', '过气', '封杀', '雪藏', '复出', '转型', '潜规则',
  ],
  food: [
    '美食', '烹饪', '厨师', '主厨', '料理', '菜谱', '食材', '调料',
    '餐厅', '饭店', '酒楼', '食堂', '小吃', '甜品', '糕点', '面馆',
    '炒菜', '炖汤', '烧烤', '火锅', '日料', '西餐', '中餐', '甜点',
    '米饭', '面条', '饺子', '包子', '馒头', '饼', '粥', '汤',
    '鱼', '肉', '鸡', '鸭', '鹅', '虾', '蟹', '贝',
    '甜', '咸', '酸', '辣', '麻', '鲜', '香', '脆',
    '开店', '摆摊', '外卖', '订餐', '排队', '排队', '网红店', '老字号',
    '蛋炒饭', '红烧肉', '鱼香肉丝', '宫保鸡丁', '麻婆豆腐', '烤鸭', '火锅', '烧烤',
    '厨艺', '刀工', '火候', '调味', '摆盘', '品鉴', '美食家', '米其林',
  ],
  farming: [
    '种田', '种地', '农场', '农庄', '田园', '乡村', '农村', '山里',
    '田地', '菜园', '果园', '鱼塘', '牧场', '养殖场', '大棚', '梯田',
    '种子', '化肥', '农药', '农具', '锄头', '镰刀', '犁', '水车',
    '小麦', '水稻', '玉米', '大豆', '花生', '棉花', '蔬菜', '水果',
    '鸡', '鸭', '鹅', '猪', '牛', '羊', '鱼', '蜜蜂',
    '丰收', '歉收', '春耕', '夏种', '秋收', '冬藏', '灌溉', '施肥',
    '穿越', '重生', '系统', '空间', '异能', '发家', '致富', '养家',
  ],
  'palace-intrigue': [
    '宫斗', '后宫', '皇后', '贵妃', '嫔妃', '贵人', '答应', '常在',
    '皇帝', '太子', '王爷', '公主', '皇子', '太后', '太嫔', '太妃',
    '宫女', '太监', '嬷嬷', '侍卫', '御医', '御厨', '禁军', '锦衣卫',
    '选秀', '侍寝', '晋位', '降位', '赐死', '打入冷宫', '册封', '废后',
    '陷害', '栽赃', '下毒', '诅咒', '巫蛊', '麝香', '红花', '滑胎',
    '争宠', '争风', '吃醋', '争权', '夺嫡', '夺位', '篡位', '夺权',
    '家族', '荣耀', '兴衰', '荣辱', '兴衰', '存亡', '生死', '命运',
  ],
  'infinite-flow': [
    '无限流', '副本', '任务', '玩家', 'NPC', '系统', '积分', '兑换',
    '生存', '死亡', '轮回', '循环', '重生', '穿越', '时空', '平行世界',
    '恐怖', '惊悚', '悬疑', '解密', '推理', '解谜', '机关', '陷阱',
    '队友', '小队', '队长', '结盟', '背叛', '牺牲', '救援', '逃跑',
    '升级', '变强', '技能', '天赋', '异能', '血统', '装备', '道具',
    '主神', '造物主', '规则', 'BUG', '隐藏', '秘密', '真相', '核心',
    '第一层', '第二层', '最终层', '终局', '结局', '通关', '失败', '团灭',
    '废弃', '医院', '学校', '公寓', '大楼', '监狱', '废墟', '森林',
  ],
  system: [
    '系统', '任务', '积分', '奖励', '惩罚', '升级', '加点', '属性',
    '宿主', '绑定', '激活', '解锁', '开启', '关闭', '退出', '进入',
    '商城', '兑换', '抽奖', '轮盘', '盲盒', '宝箱', '礼包', '福利',
    '新手', '初级', '中级', '高级', '顶级', '神级', '传说', '史诗',
    '技能', '天赋', '血统', '职业', '身份', '称号', '光环', 'buff',
    '穿越', '重生', '快穿', '末世', '古代', '现代', '未来', '异界',
    '打脸', '逆袭', '爽文', '装逼', '吊打', '碾压', '反杀', '装逼',
  ],
  anime: [
    '二次元', '动漫', '动画', '漫画', '轻小说', 'ACG', '宅', '御宅',
    '校园', '青春', '恋爱', '友情', '热血', '冒险', '奇幻', '魔法',
    '主角', '女主', '男主', '女配', '男配', '反派', '路人', '配角',
    '穿越', '转生', '异世界', '召唤', '系统', '能力', '技能', '魔法',
    '学园', '社团', '文化祭', '体育祭', '修学旅行', '暑假', '寒假', '毕业',
    '青梅竹马', '转学生', '邻座', '学姐', '学长', '学妹', '学弟', '老师',
    '傲娇', '病娇', '天然呆', '黑长直', '双马尾', '萝莉', '御姐', '正太',
  ],
  'light-novel': [
    '轻小说', '异世界', '穿越', '转生', '魔法', '剑士', '法师', '勇者',
    '魔王', '女神', '精灵', '矮人', '兽人', '龙族', '魔族', '神族',
    '冒险者', '公会', '任务', '讨伐', '探索', '迷宫', '地下城', '遗迹',
    '等级', '技能', '魔法', '装备', '道具', '药水', '金币', '宝箱',
    '后宫', '恋爱', '友情', '羁绊', '冒险', '战斗', '成长', '逆袭',
    '日常', '搞笑', '吐槽', '玩梗', 'NETA', '彩蛋', '伏笔', '转折',
    '第一卷', '第二卷', '序章', '终章', '外传', '特典', '插图', '封面',
  ],
  wuxia: [
    '武侠', '江湖', '门派', '帮派', '武林', '盟主', '掌门', '长老',
    '剑客', '刀客', '侠士', '豪杰', '英雄', '枭雄', '奸雄', '隐士',
    '武功', '内功', '外功', '轻功', '掌法', '拳法', '剑法', '刀法',
    '秘籍', '宝典', '真经', '剑谱', '刀谱', '心法', '口诀', '招式',
    '倚天', '屠龙', '玄铁', '君子', '淑女', '辟邪', '葵花', '九阳',
    '少林', '武当', '峨眉', '昆仑', '崆峒', '华山', '丐帮', '明教',
    '镖局', '客栈', '酒楼', '茶馆', '市集', '码头', '山寨', '绿林',
    '恩怨', '情仇', '侠义', '道义', '江湖', '浪子', '游侠', '剑客',
  ],
  'quick-travel': [
    '快穿', '穿越', '系统', '任务', '宿主', '位面', '世界', '剧情',
    '攻略', '男主', '女主', '反派', '配角', '路人', '光环', '金手指',
    '逆袭', '打脸', '苏爽', '甜宠', '虐渣', '复仇', '洗白', '黑化',
    '结局', 'HE', 'BE', 'OE', 'HE结局', 'BE结局', '番外', '正篇',
    '第一个世界', '第二个世界', '最终世界', '现代篇', '古代篇', '末世篇', '仙侠篇',
    '影帝', '总裁', '王爷', '皇帝', '将军', '仙尊', '魔尊', '战神',
    '白月光', '朱砂痣', '绿茶', '白莲', '备胎', '渣男', '贱女', '圣母',
  ],
  period: [
    '年代', '民国', '七八十年代', '六十年代', '五十年代', '四十年代', '三十年代', '抗战',
    '知青', '下乡', '返城', '生产队', '公社', '大队', '工分', '口粮',
    '布票', '粮票', '肉票', '油票', '糖票', '票证', '供应', '定量',
    '四合院', '大杂院', '胡同', '弄堂', '筒子楼', '平房', '窑洞', '土房',
    '自行车', '缝纫机', '手表', '收音机', '电视机', '缝纫机', '三转一响', '四大件',
    '改革开放', '个体户', '万元户', '下海', '经商', '做生意', '摆摊', '开店',
    '包办婚姻', '介绍对象', '相亲', '订婚', '结婚', '彩礼', '嫁妆', '分家',
  ],
  supernatural: [
    '灵异', '鬼怪', '鬼魂', '僵尸', '妖精', '妖怪', '精怪', '鬼魅',
    '道士', '法师', '天师', '阴阳师', '术士', '驱邪', '捉鬼', '降妖',
    '符箓', '咒语', '法阵', '桃木剑', '铜钱', '八卦', '罗盘', '照妖镜',
    '阴宅', '凶宅', '鬼屋', '墓地', '坟场', '乱葬岗', '义庄', '城隍庙',
    '阴阳眼', '通灵', '见鬼', '附身', '转世', '投胎', '还魂', '借尸还魂',
    '怨念', '执念', '怨气', '阴气', '阳气', '煞气', '邪气', '灵气',
    '超度', '化解', '封印', '镇压', '收服', '消灭', '驱散', '净化',
  ],
  fanfic: [
    '同人', '衍生', '原作', '原著', '角色', 'CP', '配对', '主角',
    '原作向', 'AU', '平行世界', '架空', '现代AU', '古代AU', '校园AU', '娱乐圈AU',
    'HE', 'BE', '甜文', '虐文', '治愈', '致郁', '搞笑', '温馨',
    '短篇', '长篇', '连载', '完结', '番外', '小剧场', '段子', '脑洞',
    '男主', '女主', '攻', '受', '忠犬', '傲娇', '腹黑', '高冷',
    '穿越', '重生', '系统', '快穿', '末世', '修仙', '玄幻', '都市',
    '剧情', '原作剧情', '改变剧情', '蝴蝶效应', '命运', '宿命', '羁绊', '约定',
    '东方', '西方', '魔法', '斗气', '剑士', '法师', '勇者', '魔王',
    '学园', '学院', '社团', '社团活动', '文化祭', '体育祭', '修学旅行', '毕业',
  ],
  mecha: [
    '机甲', '战甲', '战士', '驾驶员', '机师', '王牌', '精英', '新兵',
    '战舰', '飞船', '母舰', '护卫舰', '驱逐舰', '巡洋舰', '战列舰', '旗舰',
    '能量', '动力', '引擎', '反应堆', '核心', '芯片', '算法', '人工智能',
    '星际', '宇宙', '星系', '星球', '行星', '卫星', '小行星', '星云',
    '帝国', '联邦', '联盟', '军团', '舰队', '小队', '中队', '大队',
    '战斗', '交战', '突袭', '突围', '歼灭', '防守', '进攻', '撤退',
    '升级', '改造', '进化', '觉醒', '变异', '强化', '武装', '装甲',
  ],
  'business-war': [
    '商战', '商场', '商界', '商业', '贸易', '投资', '金融', '资本',
    '公司', '集团', '企业', '董事会', '股东', '总裁', 'CEO', '董事长',
    '并购', '收购', '吞并', '重组', '上市', '融资', '风投', '私募',
    '谈判', '合作', '竞争', '对决', '博弈', '较量', '反击', '报复',
    '阴谋', '阳谋', '算计', '布局', '设局', '破局', '翻盘', '逆袭',
    '市场', '份额', '品牌', '营销', '渠道', '供应链', '产业链', '生态',
    '合同', '协议', '违约', '赔偿', '官司', '诉讼', '律师', '法务',
  ],
  brainhole: [
    '脑洞', '奇幻', '奇想', '天方夜谭', '不可思议', '超现实', '魔幻', '玄幻',
    '穿越', '重生', '系统', '空间', '异能', '超能力', '魔法', '修仙',
    '宠物', '萌宠', '异兽', '神兽', '魔兽', '精灵', '矮人', '龙族',
    '种田', '基建', '经营', '开店', '摆摊', '美食', '直播', '网红',
    '日常', '搞笑', '温馨', '治愈', '甜宠', '爽文', '打脸', '逆袭',
    '悬疑', '推理', '解密', '反转', '烧脑', '智斗', '布局', '阴谋',
    '平行世界', '时空穿梭', '时间循环', '无限流', '快穿', '末日', '末世', '废土',
    '成精', '修炼', '觉醒', '变身', '换身', '互换', '附体', '转世',
    '手机', '电脑', '游戏', '万界', '诸天', '封神', '无敌', '躺平',
  ],
  'divine-doctor': [
    '神医', '医术', '圣手', '国医', '神针', '银针', '药王', '医仙',
    '治病', '救人', '诊断', '望闻问切', '脉象', '舌苔', '气色', '体质',
    '中药', '西药', '药方', '偏方', '秘方', '验方', '方剂', '汤药',
    '针灸', '推拿', '拔罐', '艾灸', '刮痧', '敷药', '药膳', '药浴',
    '当归', '人参', '灵芝', '何首乌', '冬虫夏草', '麝香', '熊胆', '虎骨',
    '急诊', '手术室', '病房', '门诊', '住院', '出院', '转院', '会诊',
    '癌症', '肿瘤', '心脏病', '白血病', '尿毒症', '中风', '偏瘫', '昏迷',
    '一针', '妙手', '回春', '起死回生', '药到病除', '手到病除', '悬壶', '济世',
  ],
  'tomb-raiding': [
    '盗墓', '考古', '古墓', '陵墓', '墓葬', '地下宫殿', '地宫', '墓室',
    '陪葬', '殉葬', '棺椁', '棺材', '石棺', '木棺', '金丝楠木', '青铜棺',
    '机关', '陷阱', '暗器', '毒箭', '流沙', '断龙石', '翻板', '毒气',
    '粽子', '大粽子', '尸鳖', '尸蟞', '火虫', '尸香魔芋', '青铜门', '鬼玺',
    '洛阳铲', '探阴爪', '黑驴蹄子', '糯米', '墨斗', '桃木剑', '符箓', '罗盘',
    '摸金', '卸岭', '发丘', '搬山', '摸金校尉', '卸岭力士', '发丘天官', '搬山道人',
    '寻龙', '点穴', '风水', '龙脉', '生气', '死气', '聚气', '散气',
  ],
  'son-in-law': [
    '赘婿', '入赘', '上门女婿', '姑爷', '女婿', '倒插门', '赘婿文', '赘婿',
    '丈母娘', '老丈人', '岳父', '岳母', '丈母', '老丈', '媳妇', '娘子',
    '瞧不起', '看不起', '嫌弃', '白眼', '冷嘲热讽', '讽刺', '挖苦', '鄙视',
    '废物', '废柴', '窝囊废', '没用', '没出息', '没本事', '穷酸', '寒酸',
    '打脸', '逆袭', '翻身', '崛起', '震惊', '傻眼', '后悔', '巴结',
    '隐藏', '身份', '曝光', '揭露', '实力', '背景', '靠山', '大佬',
    '老婆', '媳妇', '护妻', '宠妻', '护短', '霸道', '强势', '碾压',
  ],
  'sweet-pet': [
    '甜宠', '宠妻', '独宠', '霸宠', '甜文', '宠文', '糖文', '撒糖',
    '宠', '甜', '糖', '宠溺', '宠爱', '疼爱', '呵护', '宠着', '惯着',
    '霸总', '总裁', '大佬', '影帝', '男神', '校草', '大佬', '帝王',
    '吻', '抱', '牵手', '约会', '同居', '结婚', '蜜月', '洞房',
    '吃醋', '占有', '独占', '霸道', '强势', '护短', '壁咚', '床咚',
    '青梅竹马', '初恋', '暗恋', '双向暗恋', '久别重逢', '破镜重圆', '先婚后爱', '契约婚姻',
    '萌娃', '包子', ' twins', '龙凤胎', '双胞胎', '继承者', '小奶包', '小可爱',
  ],
  'beast-taming': [
    '御兽', '契约兽', '灵兽', '神兽', '魔兽', '妖兽', '凶兽', '异兽',
    '驯服', '契约', '签订', '召唤', '捕获', '收服', '驯化', '培养',
    '兽宠', '宠物', '灵宠', '战宠', '伴生兽', '本命兽', '血脉', '进化',
    '兽核', '兽丹', '兽晶', '兽魂', '兽骨', '兽皮', '兽肉', '兽角',
    '幼兽', '蛋', '孵化', '成长', '升级', '突破', '变异', '觉醒',
    '兽王', '兽皇', '兽帝', '兽神', '万兽之王', '百兽之王', '群兽', '兽潮',
    '森林', '山脉', '秘境', '禁地', '遗迹', '巢穴', '洞穴', '深渊',
  ],
  infrastructure: [
    '基建', '建设', '建造', '筑城', '修路', '架桥', '开荒', '拓荒',
    '领地', '领主', '城主', '庄园', '城堡', '城池', '城镇', '村落',
    '发展', '扩张', '升级', '繁荣', '兴旺', '崛起', '壮大', '扩张',
    '人口', '居民', '子民', '百姓', '农民', '工匠', '士兵', '商人',
    '农田', '矿场', '伐木场', '市场', '港口', '码头', '仓库', '工坊',
    '资源', '木材', '石料', '铁矿', '金矿', '粮食', '水源', '能源',
    '科技', '发明', '创造', '改良', '进步', '革新', '突破', '升级',
  ],
  space: [
    '空间', '随身空间', '储物空间', '异空间', '次元空间', '芥子空间', '内空间', '灵田',
    '灵泉', '灵水', '灵土', '灵气', '种植', '养殖', '储藏', '保鲜',
    '囤货', '囤积', '采购', '进货', '摆摊', '开店', '外卖', '订餐',
    '穿越', '重生', '末世', '古代', '现代', '未来', '异界', '星际',
    '灵植', '灵药', '灵草', '灵花', '灵树', '灵果', '灵米', '灵酒',
    '升级', '扩张', '解锁', '开启', '激活', '进阶', '突破', '觉醒',
    '秘密', '隐藏', '金手指', '外挂', '作弊', '优势', '底牌', '王牌',
  ],
  livestream: [
    '直播', '网红', '主播', '粉丝', '流量', '热度', '打赏', '礼物',
    '开播', '下播', '连麦', 'PK', '对战', '竞技', '互动', '弹幕',
    '关注', '点赞', '转发', '订阅', '收藏', '评论', '留言', '刷屏',
    '爆红', '出圈', '涨粉', '掉粉', '热搜', '话题', '标签', '词条',
    '带货', '种草', '推荐', '测评', '开箱', '试吃', '试用', '体验',
    '短视频', 'vlog', '纪录片', '综艺', '真人秀', '访谈', '采访', '专题',
    '平台', '签约', '解约', '违约', '赔偿', '合同', '分成', '佣金',
    '一炮而红', '出圈', '爆款', '热门', '百万', '千万', '破亿', '顶流',
  ],
};

// 题材动作词白名单：确保标题动作词与题材匹配
const GENRE_ACTIONS: Record<string, string[]> = {
  xuanhuan: ['反杀', '逆袭', '打脸', '碾压', '夺宝', '复仇', '争霸', '封神', '突破', '筑基', '结丹', '元婴', '化神', '渡劫', '飞升', '觉醒', '重生', '穿越', '降临', '收服', '拜师', '收徒', '结盟', '背叛', '寻宝', '赌约', '誓约', '联姻', '试炼', '考核', '比试', '擂台', '拍卖', '交易', '杀', '斩', '灭', '破', '夺', '救', '逃', '退', '攻', '闯'],
  xianxia: ['斩', '灭', '破', '夺', '救', '逃', '闯', '渡', '飞升', '成仙', '成神', '证道', '渡劫', '悟道', '修炼', '突破', '觉醒', '重生', '穿越', '收服', '拜师', '收徒', '结盟', '背叛', '复仇', '寻宝', '试炼', '考核', '斗法'],
  urban: ['谈判', '并购', '融资', '上市', '创业', '投资', '开发', '设计', '破案', '洗白', '打脸', '逆袭', '揭穿', '拆穿', '碾压', '收购', '竞标', '签约', '跳槽', '升职', '加薪'],
  romance: ['表白', '求婚', '暗恋', '重逢', '和解', '误会', '结婚', '离婚', '宠', '虐', '追', '逃', '躲', '救', '护', '守', '等', '盼'],
  postapocalyptic: ['猎杀', '生存', '逃亡', '战斗', '防御', '进攻', '进化', '变异', '觉醒', '突破', '升级', '收集', '掠夺', '结盟', '背叛', '复仇'],
  'sci-fi': ['探险', '战斗', '生存', '逃亡', '复仇', '争霸', '穿越', '重生', '觉醒', '突破', '升级', '建造', '改造', '进化', '变异'],
  suspense: ['破案', '推理', '调查', '揭秘', '追踪', '抓捕', '审讯', '分析', '发现', '揭露', '反转', '伪装', '误导', '破解', '识破'],
  horror: ['逃', '躲', '尖叫', '恐惧', '死亡', '诅咒', '封印', '献祭', '附身', '猎杀', '逃跑', '求救', '挣扎', '反抗', '牺牲'],
  game: ['升级', '战斗', 'PK', '团战', '攻略', '通关', '打宝', '刷怪', '组队', '公会', '竞技', '夺冠', '逆袭', '翻盘', '碾压'],
  sports: ['得分', '助攻', '突破', '进球', '防守', '进攻', '逆转', '绝杀', '夺冠', 'MVP', '超越', '逆袭', '拼搏', '坚持', '复出'],
  history: ['征战', '谋权', '改革', '变法', '起义', '统一', '争霸', '守护', '复仇', '逆袭', '突破', '觉醒', '崛起', '称霸', '征服'],
  military: ['冲锋', '撤退', '坚守', '突围', '伏击', '侦察', '作战', '训练', '演习', '任务', '救援', '牺牲', '守护', '复仇', '晋级'],
  campus: ['表白', '暗恋', '约会', '牵手', '拥抱', '考试', '竞赛', '毕业', '入学', '开学', '军训', '社团', '竞选', '逆袭', '奋斗'],
  entertainment: ['爆红', '逆袭', '出道', '封杀', '雪藏', '复出', '转型', '拍戏', '杀青', '上映', '颁奖', '官宣', '恋情', '分手', '离婚'],
  food: ['烹饪', '开店', '摆摊', '外卖', '订餐', '排队', '试吃', '品尝', '研发', '创新', '传承', '拜师', '收徒', '发家', '致富'],
  farming: ['种田', '开垦', '养殖', '种植', '丰收', '歉收', '灌溉', '施肥', '建仓', '建房', '修路', '发家', '致富', '养家', '逆袭'],
  'palace-intrigue': ['争宠', '争权', '夺嫡', '夺位', '篡位', '夺权', '陷害', '栽赃', '下毒', '诅咒', '晋位', '降位', '赐死', '册封', '废后'],
  'infinite-flow': ['通关', '团灭', '重生', '轮回', '升级', '变强', '解锁', '兑换', '抽奖', '任务', '生存', '死亡', '救援', '逃跑', '背叛'],
  system: ['升级', '加点', '激活', '解锁', '绑定', '兑换', '抽奖', '任务', '奖励', '惩罚', '打脸', '逆袭', '装逼', '吊打', '碾压'],
  anime: ['穿越', '转生', '召唤', '觉醒', '战斗', '成长', '逆袭', '恋爱', '友情', '羁绊', '冒险', '探索', '揭秘', '决战', '终结'],
  'light-novel': ['冒险', '战斗', '成长', '逆袭', '升级', '觉醒', '召唤', '穿越', '转生', '恋爱', '羁绊', '探索', '讨伐', '通关', '完结'],
  wuxia: ['对决', '比武', '较量', '切磋', '过招', '复仇', '争霸', '夺宝', '秘籍', '修炼', '突破', '觉醒', '拜师', '收徒', '闯荡'],
  'quick-travel': ['攻略', '逆袭', '打脸', '虐渣', '复仇', '洗白', '黑化', '穿越', '重生', '完成', '达成', '解锁', '通关', '失败', '成功'],
  period: ['下乡', '返城', '相亲', '订婚', '结婚', '分家', '下海', '经商', '摆摊', '开店', '致富', '逆袭', '奋斗', '养家', '过日子'],
  supernatural: ['驱邪', '捉鬼', '降妖', '超度', '封印', '镇压', '收服', '化解', '通灵', '见鬼', '附身', '还魂', '转世', '投胎', '净化'],
  fanfic: ['穿越', '重生', '改变', '拯救', '攻略', '逆袭', '打脸', '复仇', '守护', '陪伴', '成长', '觉醒', '觉醒', '约定', '羁绊'],
  mecha: ['战斗', '突袭', '突围', '歼灭', '防守', '进攻', '撤退', '升级', '改造', '进化', '觉醒', '变异', '强化', '武装', '出击'],
  'business-war': ['并购', '收购', '谈判', '合作', '竞争', '博弈', '较量', '反击', '报复', '布局', '设局', '破局', '翻盘', '逆袭', '上市'],
  brainhole: ['穿越', '重生', '觉醒', '逆袭', '打脸', '升级', '召唤', '融合', '进化', '变异', '探索', '发现', '揭秘', '反转', '脑洞'],
  'divine-doctor': ['治病', '救人', '诊断', '针灸', '开方', '配药', '抢救', '会诊', '治愈', '化解', '解毒', '调理', '康复', '妙手', '回春'],
  'tomb-raiding': ['盗墓', '考古', '发掘', '探索', '寻宝', '破阵', '破解', '逃出', '遭遇', '发现', '惊魂', '遇险', '脱险', '开棺', '探墓'],
  'son-in-law': ['打脸', '逆袭', '翻身', '崛起', '震惊', '曝光', '揭露', '碾压', '护妻', '宠妻', '护短', '强势', '出手', '登场'],
  'sweet-pet': ['宠', '宠溺', '宠爱', '呵护', '护短', '吃醋', '占有', '独占', '求婚', '表白', '同居', '结婚', '蜜月', '壁咚', '撒糖'],
  'beast-taming': ['驯服', '契约', '召唤', '捕获', '收服', '驯化', '培养', '孵化', '进化', '突破', '变异', '觉醒', '升级', '培养', '成长'],
  infrastructure: ['建设', '建造', '筑城', '修路', '架桥', '开荒', '发展', '扩张', '升级', '繁荣', '崛起', '壮大', '发明', '创造', '改良'],
  space: ['种植', '养殖', '囤货', '采购', '开店', '摆摊', '升级', '扩张', '解锁', '激活', '进阶', '突破', '觉醒', '隐藏', '曝光'],
  livestream: ['开播', '连麦', 'PK', '带货', '种草', '推荐', '测评', '开箱', '试吃', '爆红', '出圈', '涨粉', '签约', '解约', '互动'],
};

const TREASURE_SUFFIXES = [
  '诀', '功法', '宝典', '秘典', '真经', '神诀', '仙诀', '妖诀', '魔诀',
  '术', '阵法', '丹方', '符箓', '神兵', '灵宝', '法器', '宝器',
  '剑', '刀', '枪', '戟', '斧', '弓', '箭', '鞭', '剑',
  '塔', '鼎', '钟', '印', '令', '牌', '图', '卷', '册', '经',
  '玉佩', '玉符', '玉简', '宝珠', '神珠', '灵珠', '元珠',
  '圣物', '神器', '仙宝', '魔宝', '妖宝',
];

const PLACE_SUFFIXES = [
  '城', '山', '谷', '洞', '府', '阁', '殿', '宗', '门', '派',
  '岛', '湖', '海', '河', '渊', '崖', '峰', '岭', '原', '林',
  '荒原', '森林', '山脉', '禁地', '秘境', '遗迹', '废墟',
];

const HIGH_VALUE_VERBS = [
  '杀', '斩', '灭', '破', '夺', '救', '逃', '退', '攻', '闯',
  '突破', '筑基', '结丹', '元婴', '化神', '渡劫', '飞升',
  '觉醒', '重生', '穿越', '逆袭', '反杀', '打脸', '降临',
  '收服', '拜师', '收徒', '结盟', '背叛', '复仇', '寻宝',
  '赌约', '誓约', '联姻', '试炼', '考核', '比试', '擂台',
  '拍卖', '交易',
];

const SUSPENSE_MARKERS = [
  '谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然',
  '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇',
  '惊人', '震撼', '难以置信', '不可思议', '……',
];

// 意象化环境词：可用于构建"XX的XX"式意境标题
const ATMOSPHERE_ADJECTIVES = [
  '冰冷', '灼热', '苍茫', '寂静', '喧嚣', '昏暗', '明亮', '幽深',
  '萧瑟', '凄凉', '温暖', '冷酷', '朦胧', '清晰', '破碎', '完整',
  '古老', '崭新', '沉重', '轻盈', '躁动', '安宁', '狂乱', '平静',
  '猩红', '惨白', '漆黑', '银白', '昏黄', '湛蓝', '血红', '苍白',
  '孤零零', '静悄悄', '空荡荡', '乱哄哄', '阴森森', '暖洋洋',
];

const ATMOSPHERE_NOUNS = [
  '月光', '星光', '灯火', '烛光', '火光', '晨光', '暮色', '夜色',
  '雪夜', '雨夜', '黄昏', '黎明', '破晓', '残阳', '孤灯', '长街',
  '废墟', '荒野', '密林', '深渊', '云端', '峰顶', '湖畔', '渡口',
  '刀锋', '剑影', '弓弦', '甲胄', '旌旗', '战鼓', '号角', '玉坠',
  '书信', '画卷', '玉佩', '铜镜', '木牌', '石印', '琴弦', '棋子',
  '落叶', '飞花', '流萤', '星辰', '潮汐', '风沙', '烟雨', '霜雪',
];

// 金句触发词：对话中含这些词的句子可能是有冲击力的台词
const IMPACT_DIALOGUE_MARKERS = [
  '我命由我', '逆天', '不服', '凭什么', '谁敢', '必死', '必杀',
  '今日', '此生', '今生', '来世', '永不', '绝不', '誓死', '宁死',
  '天下', '苍生', '正道', '魔道', '宿命', '因果', '轮回', '生死',
  '欠你', '还你', '等我', '别走', '再见', '永别', '别怕', '有我在',
];

const GENERIC_WORDS = new Set([
  '一个', '一只', '一种', '一些', '一下', '一样', '一起', '一边',
  '自己', '他们', '我们', '你们', '这个', '那个', '这些', '那些',
  '什么', '怎么', '为什么', '哪里', '如何', '可以', '可能', '已经',
  '但是', '然后', '因为', '所以', '如果', '虽然', '不过', '只是',
  '还有', '就是', '不是', '没有', '知道', '觉得', '看到', '听到',
  '说道', '答道', '问道', '喊道', '叫道', '怒道', '笑道', '叹道',
  '心里', '心中', '脑海', '体内', '身上', '面前', '身后', '旁边',
  '同时', '此刻', '此时', '如今', '现在', '以后', '之前', '突然',
  '立刻', '马上', '赶紧', '急忙', '慢慢', '渐渐', '终于', '结果',
]);

// 口语化句式开头词：这些词开头的标题通常是口语残句，不是正经标题
const INFORMAL_START_WORDS = new Set([
  '他', '她', '它', '我', '你', '咱', '这', '那', '有', '是', '在',
  '把', '被', '给', '让', '叫', '为', '用', '从', '到', '过', '来',
  '去', '上', '下', '进', '出', '回', '往', '朝', '跟', '和', '与',
  '以', '因', '随', '依', '按', '照', '凭', '据', '靠', '借', '替',
]);

// 标题不应以这些动词结尾（口语残句特征）
const INFORMAL_END_VERBS = new Set([
  '把', '被', '给', '让', '叫', '在', '有', '是', '用', '从', '到',
  '过', '来', '去', '上', '下', '进', '出', '回', '往', '朝',
]);

// 标题句式模板：用于重组而非直接提取
const TITLE_TEMPLATES = {
  // 玄幻：势力/地点 + 冲突动作
  xuanhuan: [
    '{place}{action}',
    '{treasure}{suffix}',
    '{faction}{action}',
    '{place}的{event}',
    '{number}{unit}{event}',
  ],
  // 都市：场景 + 反差/冲突
  urban: [
    '{scene}{conflict}',
    '{number}{unit}{crisis}',
    '{object}{logic}',
    '{scene}的{event}',
    '{contrast}',
  ],
  // 言情：关系 + 情感冲突
  romance: [
    '{relation}{change}',
    '{emotion}{event}',
    '{time}{event}',
    '{suspense}',
  ],
};

const OUTLINE_LABEL_WORDS = new Set([
  '章节主题', '开头设计', '场景列表', '内容要点', '出场角色',
  '紧张度', '节拍', '地点', '开头类型', '第一个画面',
  '场景', '正文大纲', '章节大纲', '大纲', '纲要', '梗概',
  '正文', '章节', '标题',
  '钩子', '金句', '悬念点', '反转点', '情绪点', '爽点',
  '甜宠文', '玄幻文', '都市文', '末世文', '仙侠文', '言情文',
  '优先钩子', '结尾钩子',
  // 新增：大纲常用术语
  '开章立人', '立标', '铺垫', '引入', '收束', '收尾', '高潮',
  '爽点规划', '情绪曲线', '紧张度曲线', '伏笔规划', '伏笔',
  '过渡钩子', '转场', '人物立标', '章末钩子',
]);

const CHAPTER_PREFIX_PATTERN = /^第\s*[0-9０-９一二三四五六七八九十百千万两]+\s*章\s*[:：、，,.\-—–\s]*/u;
const TITLE_LABEL_PATTERN = /^(?:章节)?标题\s*[:：、，,.\-—–]+/u;
const OUTLINE_LABEL_PATTERN = /^(?:章节)?(?:大纲|纲要|梗概|正文大纲)\s*[:：、，,.\-—–\s]*["“”'‘’`《【「『（(\[]*/u;
const MARKDOWN_DECORATION_RE = /[#*_`"'“”‘’「」『』《》【】（）()[\]]/gu;
const SPLIT_PUNCTUATION_RE = /[，,。.!！?？；;：:\n\r]/u;

// 题材映射：中文题材名到英文key
const GENRE_MAP: Record<string, string> = {
  '玄幻': 'xuanhuan',
  '仙侠': 'xianxia',
  '都市': 'urban',
  '言情': 'romance',
  '末世': 'postapocalyptic',
  '科幻': 'sci-fi',
  '科幻小说': 'sci-fi',
  '修仙': 'xianxia',
  '修真': 'xianxia',
  '奇幻': 'xuanhuan',
  '现代': 'urban',
  'custom': 'xuanhuan',
  'historical': 'history',
  '古代': 'history',
  '历史': 'history',
  '悬疑': 'suspense',
  '推理': 'suspense',
  '惊悚': 'horror',
  '恐怖': 'horror',
  '游戏': 'game',
  '网游': 'game',
  '电竞': 'sports',
  '篮球': 'sports',
  '足球': 'sports',
  '体育': 'sports',
  '军事': 'military',
  '战争': 'military',
  '军旅': 'military',
  '校园': 'campus',
  '青春校园': 'campus',
  '娱乐圈': 'entertainment',
  '明星': 'entertainment',
  '影视': 'entertainment',
  '美食': 'food',
  '烹饪': 'food',
  '种田': 'farming',
  '乡土': 'farming',
  '乡村': 'farming',
  '宫斗': 'palace-intrigue',
  '宫廷': 'palace-intrigue',
  '后宫': 'palace-intrigue',
  '无限流': 'infinite-flow',
  '无限': 'infinite-flow',
  '系统': 'system',
  '系统流': 'system',
  '二次元': 'anime',
  '动漫': 'anime',
  '轻小说': 'light-novel',
  '日系': 'light-novel',
  '武侠': 'wuxia',
  '传统武侠': 'wuxia',
  '金庸': 'wuxia',
  '古龙': 'wuxia',
  '快穿': 'quick-travel',
  '快穿文': 'quick-travel',
  '穿梭': 'quick-travel',
  '年代': 'period',
  '年代文': 'period',
  '民国': 'period',
  '知青': 'period',
  '灵异': 'supernatural',
  '灵异志怪': 'supernatural',
  '鬼怪': 'supernatural',
  '鬼故事': 'supernatural',
  '同人': 'fanfic',
  '同人文': 'fanfic',
  '衍生': 'fanfic',
  '机甲': 'mecha',
  '星际机甲': 'mecha',
  '科幻机甲': 'mecha',
  '商战': 'business-war',
  '商战文': 'business-war',
  '商场': 'business-war',
  '商界': 'business-war',
  '脑洞': 'brainhole',
  '脑洞文': 'brainhole',
  '奇想': 'brainhole',
  '神医': 'divine-doctor',
  '医术': 'divine-doctor',
  '医道': 'divine-doctor',
  '神医文': 'divine-doctor',
  '盗墓': 'tomb-raiding',
  '盗墓文': 'tomb-raiding',
  '考古': 'tomb-raiding',
  '探险': 'tomb-raiding',
  '赘婿': 'son-in-law',
  '赘婿文': 'son-in-law',
  '上门女婿': 'son-in-law',
  '甜宠': 'sweet-pet',
  '甜文': 'sweet-pet',
  '宠文': 'sweet-pet',
  '宠妻': 'sweet-pet',
  '御兽': 'beast-taming',
  '御兽文': 'beast-taming',
  '驭兽': 'beast-taming',
  '基建': 'infrastructure',
  '基建文': 'infrastructure',
  '领主': 'infrastructure',
  '随身空间': 'space',
  '空间文': 'space',
  '直播': 'livestream',
  '直播文': 'livestream',
  '网红': 'livestream',
};

/**
 * 题材一致性校验：标题必须包含至少一个题材核心词
 * 返回匹配的题材词数量（越多越契合）
 */
export function checkGenreConsistency(title: string, genre: string): number {
  const genreKey = GENRE_MAP[genre] || 'xuanhuan';
  const genreWords = GENRE_KEYWORDS[genreKey] || [];
  
  let matchCount = 0;
  for (const word of genreWords) {
    if (title.includes(word)) {
      matchCount++;
    }
  }
  return matchCount;
}

/**
 * 获取题材对应的动作词列表
 */
function getGenreActions(genre: string): string[] {
  const genreKey = GENRE_MAP[genre] || 'xuanhuan';
  return GENRE_ACTIONS[genreKey] || [];
}

type TitleCandidate = {
  title: string;
  style: string;
  score: number;
  reason: string;
};

type ExtractedElements = {
  treasures: string[];
  places: string[];
  characterNames: string[];
  endingHooks: string[];
  openingEvents: string[];
  outlineTitles: string[];
  atmosphereImages: string[];
  impactQuotes: string[];
  juxtapositionPairs: string[];
  coreActions: string[];
  conflicts: string[];
  keyObjects: string[];
  suspensePoints: string[];
  coreEvents: string[];
};

export function generateSmartTitle(params: {
  content: string;
  outline?: string;
  chapterNumber: number;
  genre?: string;
  recentTitles?: string[];
  allTitles?: string[];
  knownCharacters?: string[];
  knownPlaces?: string[];
}): string {
  const { content, outline, chapterNumber, genre = '玄幻', recentTitles = [], allTitles = [], knownCharacters = [], knownPlaces = [] } = params;

  // 过滤掉空值/非字符串的 recentTitles
  const cleanRecentTitles = recentTitles.filter(t => t && typeof t === 'string');
  const cleanAllTitles = allTitles.filter(t => t && typeof t === 'string');

  // 第一步：内容驱动生成（首选，基于真实正文提取，杜绝编造）
  try {
    const contentDrivenResult = generateContentDrivenTitle({
      content,
      outline,
      chapterNumber,
      genre,
      recentTitles: cleanRecentTitles,
      allTitles: cleanAllTitles,
      knownCharacters,
      knownPlaces,
    });

    // 内容驱动生成的标题都经过了相关性校验，直接用
    if (contentDrivenResult && contentDrivenResult.title && contentDrivenResult.score >= 50) {
      return contentDrivenResult.title;
    }
  } catch {
    // 内容驱动生成失败时，静默回退到原有模板方案
  }

  // 第二步：原有模板驱动方案（兜底）
  const elements = extractKeyElements(content, outline || '');
  const candidates: TitleCandidate[] = [];

  // 最高优先级：核心事件（最能反映章节内容）
  candidates.push(...generateCoreEventTitles(elements));
  // 优先：模板驱动标题（重组而非截取）
  candidates.push(...generateTemplateTitles(elements, genre));
  // 备选：传统提取类标题
  candidates.push(...generateOutlineTitles(elements));
  candidates.push(...generateTreasureTitles(elements));
  candidates.push(...generatePlaceTitles(elements));
  candidates.push(...generateAtmosphereTitles(elements));
  candidates.push(...generateImpactQuoteTitles(elements));
  candidates.push(...generateJuxtapositionTitles(elements));
  // 兜底：低优先级标题
  candidates.push(...generateEndingHookTitles(elements));
  candidates.push(...generateCharacterActionTitles(elements));

  const scored = candidates
    .filter(c => isValidTitle(c.title))
    .map(c => {
      const diversityPenalty = computeDiversityPenalty(c.title, cleanRecentTitles);
      const qualityBonus = computeQualityBonus(c.title);
      const genreMatch = checkGenreConsistency(c.title, genre);
      const genreBonus = genreMatch >= 2 ? 8 : genreMatch === 1 ? 4 : (c.title.length <= 3 ? 0 : -5);
      
      return {
        ...c,
        score: c.score + diversityPenalty + qualityBonus + genreBonus,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return buildFallbackTitle(content, chapterNumber);
  }

  return scored[0].title;
}

function extractKeyElements(content: string, outline: string): ExtractedElements {
  const paragraphs = content.split(/\n+/u).filter(p => p.trim().length > 0);

  const headText = [outline, content.slice(0, 3000)].join('\n');
  const tailText = content.slice(-3000);
  const fullText = headText + '\n' + tailText;

  const treasures = extractTreasures(fullText);
  const places = extractPlaces(fullText);
  const characterNames = extractCharacterNames(headText);
  const endingHooks = extractEndingHooks(tailText);
  const openingEvents = extractOpeningEvents(headText);
  const outlineTitles = extractOutlineTitles(outline);
  const atmosphereImages = extractAtmosphereImages(fullText);
  const impactQuotes = extractImpactQuotes(fullText);
  const juxtapositionPairs = extractJuxtapositionPairs(fullText);
  const coreActions = extractCoreActions(fullText);
  const conflicts = extractConflicts(fullText);
  const keyObjects = extractKeyObjects(fullText);
  const suspensePoints = extractSuspensePoints(fullText);
  const coreEvents = extractCoreEvents(fullText, characterNames, places, treasures, coreActions);

  return {
    treasures,
    places,
    characterNames,
    endingHooks,
    openingEvents,
    outlineTitles,
    atmosphereImages,
    impactQuotes,
    juxtapositionPairs,
    coreActions,
    conflicts,
    keyObjects,
    suspensePoints,
    coreEvents,
  };
}

function extractTreasures(text: string): string[] {
  const treasures = new Map<string, number>();

  for (const suffix of TREASURE_SUFFIXES) {
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{2,6}${suffix})`, 'g');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = match[1];
      if (isValidTreasureName(item)) {
        treasures.set(item, (treasures.get(item) || 0) + 1);
      }
    }
  }

  return Array.from(treasures.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 6);
}

function isValidTreasureName(name: string): boolean {
  if (name.length < 2 || name.length > 6) return false;
  if (GENERIC_WORDS.has(name)) return false;
  if (/^[\u4e00-\u9fa5]+$/.test(name) === false) return false;

  const badPrefixes = ['这个', '那个', '什么', '怎么', '为什么', '哪里', '如何', '可以', '可能'];
  for (const prefix of badPrefixes) {
    if (name.startsWith(prefix)) return false;
  }

  // 含否定/疑问词的"宝物名"通常是句子截断（如"段没有经"），过滤
  const negationFragments = ['没有', '不是', '不能', '不会', '无法', '还没', '尚未', '不曾'];
  for (const frag of negationFragments) {
    if (name.includes(frag)) return false;
  }

  return true;
}

function extractPlaces(text: string): string[] {
  const places = new Map<string, number>();

  for (const suffix of PLACE_SUFFIXES) {
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{2,6}${suffix})`, 'g');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const place = match[1];
      if (isValidPlaceName(place)) {
        places.set(place, (places.get(place) || 0) + 1);
      }
    }
  }

  return Array.from(places.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 4);
}

function isValidPlaceName(name: string): boolean {
  if (name.length < 2 || name.length > 6) return false;
  if (GENERIC_WORDS.has(name)) return false;
  if (/^[\u4e00-\u9fa5]+$/.test(name) === false) return false;

  const badPrefixes = ['这个', '那个', '什么', '怎么', '哪里', '如何', '可以', '可能'];
  for (const prefix of badPrefixes) {
    if (name.startsWith(prefix)) return false;
  }

  // 过滤人名前缀（常见姓氏）
  const commonSurnames = ['赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜', '谢', '宋', '唐', '邓', '梁', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范', '彭', '郎', '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳', '酆', '鲍', '史', '唐', '费', '廉', '岑', '薛', '雷', '贺', '倪', '汤', '滕', '殷', '罗', '毕', '郝', '邬', '安', '常', '乐', '于', '时', '傅', '皮', '卞', '齐', '康', '伍', '余', '元', '卜', '顾', '孟', '平', '黄', '和', '穆', '萧', '尹', '姚', '邵', '湛', '汪', '祁', '毛', '禹', '狄', '米', '贝', '明', '臧', '计', '伏', '成', '戴', '谈', '宋', '茅', '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁'];
  if (name.length === 3) {
    const firstChar = name.charAt(0);
    if (commonSurnames.includes(firstChar)) {
      // 3字且第一个是常见姓氏，很可能是人名
      return false;
    }
  }

  // 过滤动作词结尾的"地点"
  const actionSuffixes = ['推开', '旋转', '就派', '已经', '张弓', '靠在', '英文', '中文', '原文', '翻译'];
  for (const suffix of actionSuffixes) {
    if (name.includes(suffix)) return false;
  }

  // 过滤纯动作词组合（不含地点特征词）
  if (!PLACE_SUFFIXES.some(s => name.includes(s))) {
    return false;
  }

  return true;
}

function extractCharacterNames(text: string): string[] {
  const patterns = [
    /([\u4e00-\u9fa5]{2,3})(?:道|说|喊|叫|问|答|冷|惊|怒|笑|叹|皱眉|点头|摇头)/g,
    /([\u4e00-\u9fa5]{2,3})(?:公子|姑娘|长老|掌门|尊者|大人|少主|小姐|师兄|师弟)/g,
  ];

  const names = new Map<string, number>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (isLikelyPersonName(name)) {
        names.set(name, (names.get(name) || 0) + 1);
      }
    }
  }

  return Array.from(names.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5);
}

function isLikelyPersonName(name: string): boolean {
  if (name.length < 2 || name.length > 3) return false;
  if (GENERIC_WORDS.has(name)) return false;
  if (/^[\u4e00-\u9fa5]+$/.test(name) === false) return false;

  const badStart = ['这', '那', '哪', '什', '怎', '为', '如', '何', '可', '能', '已', '但', '而', '虽', '不', '没'];
  for (const char of badStart) {
    if (name.startsWith(char)) return false;
  }

  // 3字词的中字或末字是常见副词/否定词的，不是人名（如"顾炎没"、"张三不"）
  if (name.length === 3) {
    const badMiddleOrLast = ['不', '没', '也', '都', '就', '还', '又', '再', '才', '已', '曾', '正', '刚', '将', '欲', '会', '能', '可', '以', '要', '很', '太', '更', '最', '只'];
    if (badMiddleOrLast.includes(name.charAt(1)) || badMiddleOrLast.includes(name.charAt(2))) {
      return false;
    }
  }

  return true;
}

function extractEndingHooks(tailText: string): string[] {
  const sentences = tailText.split(/[。！？!?\n]/u).filter(s => s.trim().length > 0);
  const hooks: string[] = [];

  for (const sentence of sentences.slice(-10)) {
    const trimmed = sentence.trim();
    if (trimmed.length < 4 || trimmed.length > 14) continue;

    let score = 0;
    for (const marker of SUSPENSE_MARKERS) {
      if (trimmed.includes(marker)) score += 2;
    }
    if (/[？?]$/.test(trimmed)) score += 3;
    if (/[！!]$/.test(trimmed)) score += 1;

    for (const verb of HIGH_VALUE_VERBS) {
      if (trimmed.includes(verb)) {
        score += 2;
        break;
      }
    }

    if (score >= 4 && isValidHookSentence(trimmed)) {
      hooks.push(trimmed);
    }
  }

  return hooks.slice(0, 3);
}

function isValidHookSentence(sentence: string): boolean {
  if (GENERIC_WORDS.has(sentence)) return false;
  if (/^[，,。.！!？?；;：:、]/.test(sentence)) return false;
  if (sentence.length < 4 || sentence.length > 12) return false;
  return true;
}

function extractOpeningEvents(headText: string): string[] {
  const paragraphs = headText.split(/\n+/u).filter(p => p.trim().length > 0);
  const events: string[] = [];

  for (const para of paragraphs.slice(0, 5)) {
    const sentences = para.split(/[。！？!?]/u).filter(s => s.trim().length > 0);
    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      if (trimmed.length >= 6 && trimmed.length <= 14) {
        for (const verb of HIGH_VALUE_VERBS) {
          if (trimmed.includes(verb)) {
            events.push(trimmed);
            break;
          }
        }
      }
    }
  }

  return events.slice(0, 3);
}

function extractOutlineTitles(outline: string): string[] {
  if (!outline) return [];

  const titles: string[] = [];
  const lines = outline.split(/\n+/u).filter(l => l.trim().length > 0);

  const bookTitleMatch = outline.match(/《([^》]{2,10})》/);
  if (bookTitleMatch) {
    const clean = sanitizeTitleCandidate(bookTitleMatch[1]);
    if (clean.length >= 2 && clean.length <= 8 && isValidTitle(clean)) {
      titles.push(clean);
    }
  }

  const themeMatch = outline.match(/章节主题[：:\n\r]+([^\n\r]{4,20})/);
  if (themeMatch) {
    const themeText = themeMatch[1].trim();
    const commaParts = themeText.split(/[，,]/u).filter(p => p.trim().length >= 2 && p.trim().length <= 8);
    for (const part of commaParts.slice(0, 2)) {
      const clean = sanitizeTitleCandidate(part);
      if (clean.length >= 3 && clean.length <= 10 && isValidTitle(clean) && !titles.includes(clean)) {
        titles.push(clean);
      }
    }
  }

  for (const line of lines.slice(0, 10)) {
    const clean = sanitizeTitleCandidate(line);
    if (clean.length >= 3 && clean.length <= 10 && isValidTitle(clean)) {
      if (!titles.includes(clean)) {
        titles.push(clean);
      }
    }
  }

  return titles.slice(0, 3);
}

function generateTreasureTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.treasures.length; i++) {
    const treasure = elements.treasures[i];
    const bonus = i === 0 ? 5 : 0;
    candidates.push({
      title: treasure,
      style: 'treasure',
      score: 78 + bonus + Math.min(treasure.length - 2, 3),
      reason: `宝物/功法：${treasure}`,
    });
  }

  return candidates;
}

function generatePlaceTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.places.length; i++) {
    const place = elements.places[i];
    const bonus = i === 0 ? 3 : 0;
    candidates.push({
      title: place,
      style: 'place',
      score: 68 + bonus,
      reason: `地点：${place}`,
    });
  }

  return candidates;
}

function generateEndingHookTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.endingHooks.length; i++) {
    const hook = elements.endingHooks[i];
    let clean = cleanHookForTitle(hook);
    // 遇到"已经/便/就/才"等中间副词时截断到副词前，避免残句
    clean = trimAtIncompleteMiddle(clean);
    if (clean.length >= 4 && clean.length <= 8 && isValidTitle(clean)) {
      const bonus = i === 0 ? 3 : 0;
      candidates.push({
        title: clean,
        style: 'hook',
        score: 62 + bonus,
        reason: `章末钩子：${clean}`,
      });
    }
  }

  return candidates;
}

function cleanHookForTitle(hook: string): string {
  let clean = hook.trim();
  const punctIndex = clean.search(SPLIT_PUNCTUATION_RE);
  if (punctIndex > 0) clean = clean.slice(0, punctIndex);

  const badStarts = ['但是', '然而', '不过', '只是', '而且', '并且', '所以', '因此', '于是', '然后'];
  for (const start of badStarts) {
    if (clean.startsWith(start)) {
      clean = clean.slice(start.length);
      break;
    }
  }

  return clean;
}

function generateCharacterActionTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  if (elements.characterNames.length === 0) return candidates;

  const topName = elements.characterNames[0];

  for (const verb of HIGH_VALUE_VERBS.slice(0, 15)) {
    const title = topName + verb;
    if (title.length >= 4 && title.length <= 8 && isValidTitle(title)) {
      candidates.push({
        title,
        style: 'character-action',
        score: 58,
        reason: `角色+动作：${title}`,
      });
    }
  }

  return candidates.slice(0, 3);
}

function generateOutlineTitles(elements: ExtractedElements): TitleCandidate[] {
  return elements.outlineTitles.map(title => {
    let bonus = 0;
    if (title.length >= 4 && title.length <= 6) bonus += 5;
    else if (title.length >= 3 && title.length <= 8) bonus += 2;
    else if (title.length >= 9 && title.length <= 10) bonus -= 2;
    return {
      title,
      style: 'outline',
      score: 80 + bonus,
      reason: `大纲标题：${title}`,
    };
  });
}

function sanitizeTitleCandidate(raw: string): string {
  let candidate = raw
    .trim()
    .replace(CHAPTER_PREFIX_PATTERN, '')
    .replace(TITLE_LABEL_PATTERN, '')
    .replace(OUTLINE_LABEL_PATTERN, '')
    .replace(MARKDOWN_DECORATION_RE, '')
    .replace(/\s+/gu, '');

  const punctIndex = candidate.search(SPLIT_PUNCTUATION_RE);
  if (punctIndex > 0) candidate = candidate.slice(0, punctIndex);

  return candidate;
}

function isValidTitle(title: string): boolean {
  if (!title) return false;
  if (title.length < 2 || title.length > 12) return false;
  if (!/^[\u4e00-\u9fa5]+$/.test(title)) return false;
  if (GENERIC_WORDS.has(title)) return false;
  if (OUTLINE_LABEL_WORDS.has(title)) return false;

  for (const word of OUTLINE_LABEL_WORDS) {
    if (title === word || title.startsWith(word)) return false;
  }

  const badStartChars = ['但', '而', '且', '或', '则', '故', '乃', '若', '虽', '不', '没', '已', '才', '正', '还', '又', '再', '更', '最', '很', '太', '都'];
  for (const char of badStartChars) {
    if (title.startsWith(char) && title.length <= 4) return false;
  }

  // 口语化残句检测：以"他/我/把"等开头的短标题通常是口语残句
  if (title.length <= 4) {
    for (const word of INFORMAL_START_WORDS) {
      if (title.startsWith(word)) return false;
    }
  }
  // 更严格：以"他把/我把/以证据/有人"等开头的一律过滤（最多8字标题）
  if (title.length <= 8) {
    if (/^(他|她|我|你|把|被|给|让|以|因|随|依|按|照|凭|据|有人|什么|怎么|为什么)/.test(title)) return false;
  }
  // 任何长度都不允许以这些词开头（"把/被/给/让"开头的通常是残句）
  // 注："我/你/他/她"在7字以上的标题中很常见（如"我的师兄太强了"），故仅对短标题限制
  if (/^(把|被|给|让)/.test(title)) return false;

  // 残句结尾词：标题以这些副词/虚词结尾视为不完整句子
  const incompleteEndings = ['已经', '便', '就', '才', '曾', '正', '刚', '将', '欲', '还', '尚', '正要', '正欲'];
  for (const ending of incompleteEndings) {
    if (title.endsWith(ending)) return false;
  }

  // 虚词/介词结尾：以这些字结尾的标题通常是句子片段
  const weakEndChars = ['的', '了', '着', '过', '在', '向', '于', '得', '地', '是', '为', '被', '把', '将', '与', '和', '及', '或', '乃', '其', '此', '彼', '之'];
  if (title.length <= 6) {
    for (const char of weakEndChars) {
      if (title.endsWith(char)) return false;
    }
  }

  // 口语化动词结尾：以"把/被/让"等结尾的是口语残句（仅对短标题严格，避免误伤"驾到""杀出"等）
  if (title.length <= 4) {
    for (const verb of INFORMAL_END_VERBS) {
      if (title.endsWith(verb)) return false;
    }
  }

  // 时间数字类：含数字 + 复合时间单位（分钟/秒钟/小时/时辰 等），这类词组不会出现在好标题中
  const compoundTimeUnit = /(分钟|秒钟|小时|个钟头|个时辰|刻钟|个半|余分)/;
  const hasNum = /[一二三四五六七八九十百千万两零多几\d]/;
  if (compoundTimeUnit.test(title) && hasNum.test(title)) return false;

  // 基础时间单位 + 数字 + 修饰词（如"三天多""第七日""约一年""每隔五天"）
  const basicTimeWithModifier = /^(每|早|晚|又|再|还|休息|停|等|隔|打|用|花|过|剩|差|少|多|近|约|大约|大概|不到|超过|前|后)?[一二三四五六七八九十百千万两零多几\d]+(多|余|几|到[一二三四五六七八九十百千万两零多几\d]+)?(天|年|月|日|周)(之?(前|后|以)?)?$/;
  if (basicTimeWithModifier.test(title)) return false;

  if (/^[一二三四五六七八九十百千万两]+(分钟|秒|小时|天|年|章|节|次|场|局|步|个|只|条|把|柄|枚|颗|块|片|卷|册)$/.test(title)) return false;

  if (/^[第]?[一二三四五六七八九十百千万两\d]+[章节回卷]$/.test(title)) return false;

  const genericSuffixes = ['的时候', '的地方', '的东西', '的感觉', '的样子', '的事情', '的问题'];
  for (const suffix of genericSuffixes) {
    if (title.endsWith(suffix)) return false;
  }

  // 模式检测：纯动作描述句式（如"游哨按住腰刀"）
  // 结构：职业/角色 + 日常动作 + 物件，这类是描述句不是标题
  if (/^(游哨|守军|巡逻|侍卫|护卫|兵卒|士兵|将领|将军|统领|首领|弟子|门人|长老|宗主|掌门|城主|府主|庄主|阁主|阁主|殿主|峰主|堂主|舵主|帮主|盟主|族长|家主|老祖|祖师|师父|师傅|师尊|师兄|师姐|师弟|师妹|同门|道友|仙友|仙子|仙君|仙尊|仙帝|仙皇|仙王|仙圣|仙贤|真人|真君|真王|真尊|大帝|大帝|帝皇|帝君|帝王|帝尊|帝圣|帝贤|圣君|圣王|圣尊|圣帝|圣皇|圣贤|神君|神王|神尊|神帝|神皇|神圣|神贤|魔君|魔王|魔尊|魔帝|魔皇|魔圣|魔贤|妖君|妖王|妖尊|妖帝|妖皇|妖圣|妖贤|鬼君|鬼王|鬼尊|鬼帝|鬼皇|鬼圣|鬼贤|邪君|邪王|邪尊|邪帝|邪皇|邪圣|邪贤|正君|正王|正尊|正帝|正皇|正圣|正贤|邪魔|正道|魔道|仙道|神道|佛道|妖道|鬼道|邪道|天道|地道|人道|大道|小道|外道|内道|旁道|左道|右道|上道|下道|前道|后道|中道|南道|北道|东道|西道|东南道|东北道|西南道|西北道|中原|南疆|北疆|东疆|西疆|东南疆|东北疆|西南疆|西北疆|中土|南土|北土|东土|西土|东南土|东北土|西南土|西北土|中域|南域|北域|东域|西域|东南域|东北域|西南域|西北域|中州|南州|北州|东州|西州|东南州|东北州|西南州|西北州|中省|南省|北省|东省|西省|东南省|东北省|西南省|西北省|中郡|南郡|北郡|东郡|西郡|东南郡|东北郡|西南郡|西北郡|中县|南县|北县|东县|西县|东南县|东北县|西南县|西北县|中城|南城|北城|东城|西城|东南城|东北城|西南城|西北城|中镇|南镇|北镇|东镇|西镇|东南镇|东北镇|西南镇|西北镇|中村|南村|北村|东村|西村|东南村|东北村|西南村|西北村|中乡|南乡|北乡|东乡|西乡|东南乡|东北乡|西南乡|西北乡|中里|南里|北里|东里|西里|东南里|东北里|西南里|西北里|中街|南街|北街|东街|西街|东南街|东北街|西南街|西北街|中路|南路|北路|东路|西路|东南路|东北路|西南路|西北路|中道|南道|北道|东道|西道|东南道|东北道|西南道|西北道)/.test(title)) return false;

  return true;
}

function computeDiversityPenalty(title: string, recentTitles: string[]): number {
  if (recentTitles.length === 0) return 0;

  let penalty = 0;
  const normalized = title.replace(/\s+/gu, '');
  const vsPattern = /^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/u;
  const isVsTitle = vsPattern.test(normalized);

  for (const recent of recentTitles) {
    const recentNorm = recent.replace(/\s+/gu, '');
    if (!recentNorm) continue;

    if (recentNorm === normalized) {
      penalty += 30;
      continue;
    }

    if (normalized.slice(0, 2) === recentNorm.slice(0, 2)) {
      penalty += 10;
    }
    if (normalized.slice(-2) === recentNorm.slice(-2)) {
      penalty += 6;
    }
    if (normalized.length === recentNorm.length) {
      penalty += 3;
    }

    // XXvsXX模式重复检测
    if (isVsTitle && vsPattern.test(recentNorm)) {
      penalty += 20;
    }

    // 语义相似度检测（Jaccard相似度）
    const jaccard = jaccardSimilarity(normalized, recentNorm);
    if (jaccard >= 0.6) penalty += 20;
    else if (jaccard >= 0.4) penalty += 10;
    else if (jaccard >= 0.25) penalty += 5;

    // 句式结构相似度检测
    if (isSamePattern(normalized, recentNorm)) {
      penalty += 8;
    }

    // 动作词重复检测（连续章节使用相同的动作词）
    if (shareActionWord(normalized, recentNorm)) {
      penalty += 15;
    }

    // 人物名称重复检测（相同人物出现在多个标题中）
    const charMatch = findCharacterOverlap(normalized, recentNorm);
    if (charMatch.length >= 2) {
      penalty += 10 + charMatch.length * 5;
    }

    // 相同动作+相同人物模式检测（如"打脸沈庭舟"重复出现）
    if (shareActionWord(normalized, recentNorm) && charMatch.length >= 2) {
      penalty += 20;
    }
  }

  return -penalty;
}

function jaccardSimilarity(s1: string, s2: string): number {
  const set1 = new Set(s1.split(''));
  const set2 = new Set(s2.split(''));
  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSamePattern(s1: string, s2: string): boolean {
  if (s1.length !== s2.length) return false;
  
  for (let i = 0; i < s1.length; i++) {
    const c1 = s1[i];
    const c2 = s2[i];
    const isChinese1 = /[\u4e00-\u9fa5]/.test(c1);
    const isChinese2 = /[\u4e00-\u9fa5]/.test(c2);
    if (isChinese1 !== isChinese2) return false;
  }
  return true;
}

function shareActionWord(s1: string, s2: string): boolean {
  const actionWords = [...GENRE_ACTIONS.xuanhuan, ...GENRE_ACTIONS.xianxia, ...GENRE_ACTIONS.urban];
  for (const action of actionWords) {
    if (action.length >= 2 && s1.includes(action) && s2.includes(action)) {
      return true;
    }
  }
  return false;
}

function findCharacterOverlap(s1: string, s2: string): string[] {
  const chars: string[] = [];
  const twoCharPattern = /[\u4e00-\u9fa5]{2}/g;
  const threeCharPattern = /[\u4e00-\u9fa5]{3}/g;

  const s1Chars = new Set<string>();
  let match;
  while ((match = threeCharPattern.exec(s1)) !== null) {
    s1Chars.add(match[0]);
  }
  threeCharPattern.lastIndex = 0;
  while ((match = twoCharPattern.exec(s1)) !== null) {
    s1Chars.add(match[0]);
  }

  while ((match = threeCharPattern.exec(s2)) !== null) {
    if (s1Chars.has(match[0])) {
      chars.push(match[0]);
    }
  }
  threeCharPattern.lastIndex = 0;
  while ((match = twoCharPattern.exec(s2)) !== null) {
    if (s1Chars.has(match[0])) {
      chars.push(match[0]);
    }
  }

  return [...new Set(chars)];
}

function extractAtmosphereImages(text: string): string[] {
  const images = new Map<string, number>();

  for (const noun of ATMOSPHERE_NOUNS) {
    if (!text.includes(noun)) continue;
    for (const adj of ATMOSPHERE_ADJECTIVES) {
      const pattern = new RegExp(`${adj}[的地得]?${noun}`, 'g');
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        const phrase = matches[0];
        if (phrase.length >= 4 && phrase.length <= 8) {
          images.set(phrase, (images.get(phrase) || 0) + matches.length);
        }
      }
    }
    // 纯名词也记录（频次为出现次数）
    const nounPattern = new RegExp(noun, 'g');
    const nounMatches = text.match(nounPattern);
    if (nounMatches) {
      images.set(noun, (images.get(noun) || 0) + nounMatches.length);
    }
  }

  return Array.from(images.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 6);
}

function extractImpactQuotes(text: string): string[] {
  const quotes: string[] = [];
  const dialoguePattern = /[「""'']([^「""''\n]{4,12})[」""'']/g;
  let match;
  while ((match = dialoguePattern.exec(text)) !== null) {
    const line = match[1].trim();
    if (line.length < 4 || line.length > 12) continue;
    if (GENERIC_WORDS.has(line)) continue;
    if (!/^[\u4e00-\u9fa5]+$/.test(line)) continue;

    let impactScore = 0;
    for (const marker of IMPACT_DIALOGUE_MARKERS) {
      if (line.includes(marker)) {
        impactScore += 3;
        break;
      }
    }
    for (const verb of HIGH_VALUE_VERBS) {
      if (line.includes(verb)) {
        impactScore += 2;
        break;
      }
    }
    if (/[！!？?]$/.test(match[0])) impactScore += 2;

    if (impactScore >= 4 && isValidTitle(line)) {
      quotes.push(line);
    }
  }

  return quotes.slice(0, 5);
}

function extractJuxtapositionPairs(text: string): string[] {
  const pairs: string[] = [];
  // "X与Y"、"X和Y"、"X对Y"、"X之Y" 模式
  const patterns = [
    /([\u4e00-\u9fa5]{2,4})与([\u4e00-\u9fa5]{2,4})/g,
    /([\u4e00-\u9fa5]{2,4})和([\u4e00-\u9fa5]{2,4})/g,
    /([\u4e00-\u9fa5]{2,4})对([\u4e00-\u9fa5]{2,4})/g,
    /([\u4e00-\u9fa5]{2,4})之([\u4e00-\u9fa5]{2,4})/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const left = match[1];
      const right = match[2];
      const pair = `${left}与${right}`;
      if (pair.length >= 5 && pair.length <= 10
        && isValidTitle(left) && isValidTitle(right)
        && left !== right
        && !pairs.includes(pair)) {
        pairs.push(pair);
      }
    }
  }

  return pairs.slice(0, 4);
}

function extractCoreEvents(
  text: string,
  characterNames: string[],
  places: string[],
  treasures: string[],
  coreActions: string[],
): string[] {
  const events = new Map<string, number>();
  const paragraphs = text.split(/\n+/u).filter(p => p.trim().length > 0);

  for (const para of paragraphs.slice(0, 15)) {
    const sentences = para.split(/[。！？!?\n]/u).filter(s => s.trim().length > 0);
    for (const sentence of sentences.slice(0, 3)) {
      const trimmed = sentence.trim();
      if (trimmed.length < 6 || trimmed.length > 20) continue;

      let score = 0;
      for (const char of characterNames) {
        if (trimmed.includes(char)) score += 5;
      }
      for (const place of places) {
        if (trimmed.includes(place)) score += 4;
      }
      for (const treasure of treasures) {
        if (trimmed.includes(treasure)) score += 4;
      }
      for (const action of coreActions) {
        if (trimmed.includes(action)) score += 6;
      }

      if (score >= 8) {
        let clean = trimmed;
        const punctIndex = clean.search(/[，,、]/);
        if (punctIndex > 3 && punctIndex <= 10) {
          clean = clean.slice(0, punctIndex);
        }
        clean = clean.replace(/[，,。.!！?？、:：;；…—]/g, '');
        if (clean.length >= 4 && clean.length <= 10 && isValidTitle(clean)) {
          events.set(clean, (events.get(clean) || 0) + score);
        }
      }
    }
  }

  return Array.from(events.entries())
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0])
    .slice(0, 5);
}

function generateCoreEventTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.coreEvents.length; i++) {
    const event = elements.coreEvents[i];
    if (!isValidTitle(event)) continue;
    const bonus = i === 0 ? 8 : i === 1 ? 4 : 2;
    candidates.push({
      title: event,
      style: 'core-event',
      score: 85 + bonus,
      reason: `核心事件：${event}`,
    });
  }

  return candidates;
}

function generateAtmosphereTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.atmosphereImages.length; i++) {
    const image = elements.atmosphereImages[i];
    if (!isValidTitle(image)) continue;
    const bonus = i === 0 ? 5 : i === 1 ? 2 : 0;
    const isPhrase = image.length >= 5;
    candidates.push({
      title: image,
      style: 'atmosphere',
      score: 75 + bonus + (isPhrase ? 6 : 0),
      reason: `意象画面：${image}`,
    });
  }

  return candidates;
}

function generateImpactQuoteTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.impactQuotes.length; i++) {
    const quote = elements.impactQuotes[i];
    if (!isValidTitle(quote)) continue;
    const bonus = i === 0 ? 4 : 0;
    candidates.push({
      title: quote,
      style: 'quote',
      score: 70 + bonus,
      reason: `金句台词：${quote}`,
    });
  }

  return candidates;
}

/**
 * 提取核心冲突动作：用于模板驱动标题
 * 如：反杀、逆袭、突破、打脸、碾压
 */
function extractCoreActions(text: string): string[] {
  const actions = new Map<string, number>();

  // 爽文高频动作词
  const ACTION_WORDS = [
    '反杀', '逆袭', '突破', '打脸', '碾压', '吞并', '收服',
    '觉醒', '复仇', '夺权', '掌权', '上位', '登顶', '称王',
    '破境', '筑基', '结丹', '渡劫', '飞升', '封神',
    '夺宝', '夺位', '夺城', '夺地', '夺权', '夺妻', '夺女',
    '救美', '救人', '救城', '救国', '救世', '救命',
    '破城', '破阵', '破局', '破关', '破禁', '破封',
    '杀敌', '杀怪', '杀妖', '杀魔', '杀人', '杀神',
    '斩首', '斩妖', '斩魔', '斩神', '斩龙', '斩虎',
    '灭族', '灭门', '灭国', '灭世', '灭城', '灭军',
    '逃亡', '逃杀', '逃婚', '逃城', '逃国', '逃世',
    '闯关', '闯阵', '闯城', '闯宫', '闯府', '闯门',
    '觉醒', '重生', '穿越', '降临', '复活', '重生',
  ];

  for (const action of ACTION_WORDS) {
    const regex = new RegExp(action, 'g');
    const matches = text.match(regex);
    if (matches) {
      actions.set(action, (actions.get(action) || 0) + matches.length);
    }
  }

  return Array.from(actions.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5);
}

/**
 * 提取冲突场景关键词
 */
function extractConflicts(text: string): string[] {
  const conflicts: string[] = [];

  // 冲突场景模式
  const CONFLICT_PATTERNS = [
    /([军屯|粮仓|炮阵|祭坛|城门|宫门|府门|门阀|家族|宗门|门派|势力|联盟|联军])的/,
    /([危机|危机|危机|转折|转折|转折|冲突|冲突|冲突])/,
  ];

  // 直接匹配常见冲突词
  const conflictWords = ['危机', '转折', '冲突', '决战', '决战', '交锋', '对决', '对峙', '谈判', '谈判', '谈判', '博弈', '博弈', '博弈'];
  for (const word of conflictWords) {
    if (text.includes(word)) conflicts.push(word);
  }

  return conflicts.slice(0, 4);
}

/**
 * 提取关键物件/物品名（用于标题意象）
 */
function extractKeyObjects(text: string): string[] {
  const objects = new Map<string, number>();

  // 关键物件模式：含"箭/刀/剑/印/牌/书/信/图"等
  const OBJECT_PATTERNS = [
    /[赵魏韩燕齐楚秦吴越][字]?箭/,
    /[赵魏韩燕齐楚秦吴越][字]?刀/,
    /[赵魏韩燕齐楚秦吴越][字]?剑/,
    /玉[佩印牌符简坠]/,
    /铜[镜印牌符]/,
    /血[衣甲袍衫]/,
    /令[牌箭符]/,
    /密[信函书图]/,
    /残[玉佩印牌符简坠]/,
    /旧[玉佩印牌符简坠]/,
    /破[玉佩印牌符简坠]/,
  ];

  for (const pattern of OBJECT_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'g'));
    if (matches) {
      for (const match of matches) {
        if (match.length >= 2 && match.length <= 4) {
          objects.set(match, (objects.get(match) || 0) + 1);
        }
      }
    }
  }

  return Array.from(objects.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5);
}

/**
 * 提取悬念点（用于悬念式标题）
 */
function extractSuspensePoints(text: string): string[] {
  const points: string[] = [];

  // 悬念句式模式
  const suspensePatterns = [
    /真相[是为何]/,
    /秘密[是为何]/,
    /谜底[是为何]/,
    /身份[是为何]/,
    /来历[是为何]/,
    /背后[是为何]/,
    /幕后[是为何]/,
    /真相$/,
    /秘密$/,
    /谜底$/,
  ];

  for (const pattern of suspensePatterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      if (match) points.push(match[0]);
    }
  }

  return points.slice(0, 3);
}

/**
 * 模板驱动标题生成：用提取元素重组标题而非直接截取句子
 */
function generateTemplateTitles(elements: ExtractedElements, genre: string): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];
  const genreActions = getGenreActions(genre);
  const genreKey = GENRE_MAP[genre] || 'xuanhuan';

  // 模板1：地点 + 冲突动作（优先使用题材动作词）
  if (elements.places.length > 0) {
    const place = elements.places[0].slice(0, 4);
    
    // 优先从题材动作词中选择
    let action = '';
    if (genreActions.length > 0) {
      for (const ga of genreActions) {
        if (elements.coreActions.includes(ga)) {
          action = ga;
          break;
        }
      }
    }
    // 如果没有匹配的题材动作词，用核心动作
    if (!action && elements.coreActions.length > 0) {
      action = elements.coreActions[0];
    }

    if (action) {
      const title = place + action;
      if (isValidTitle(title)) {
        candidates.push({
          title,
          style: 'template-place-action',
          score: 78,
          reason: `模板：{地点}{动作} → ${title}`,
        });
      }
    }
  }

  // 模板2：势力名 + 冲突结果
  if (elements.places.length > 0) {
    const place = elements.places[0];
    const suffixes = ['之变', '之劫', '之血', '之火', '之祸', '之战', '之危', '之难'];
    for (const suffix of suffixes) {
      const title = place.slice(0, 4) + suffix;
      if (isValidTitle(title)) {
        candidates.push({
          title,
          style: 'template-place-event',
          score: 76,
          reason: `模板：{地点}{事件} → ${title}`,
        });
        break;
      }
    }
  }

  // 模板3：地点 + 题材专属动作词（按题材适配）
  if (elements.places.length > 0) {
    const place = elements.places[0].slice(0, 4);
    
    // 按题材选择动作词
    let actionWords: string[] = [];
    
    switch (genreKey) {
      case 'xuanhuan':
        actionWords = ['突破', '觉醒', '渡劫', '飞升', '封神', '反杀', '逆袭', '打脸'];
        break;
      case 'xianxia':
        actionWords = ['飞升', '成仙', '证道', '渡劫', '悟道', '突破', '斩', '灭'];
        break;
      case 'urban':
        actionWords = ['谈判', '并购', '融资', '上市', '打脸', '逆袭', '揭穿', '拆穿'];
        break;
      case 'romance':
        actionWords = ['表白', '求婚', '重逢', '误会', '宠', '虐', '追', '逃'];
        break;
      case 'postapocalyptic':
        actionWords = ['猎杀', '生存', '进化', '变异', '觉醒', '突破'];
        break;
      case 'sci-fi':
        actionWords = ['探险', '战斗', '穿越', '重生', '突破', '升级'];
        break;
      default:
        actionWords = ['突破', '觉醒', '逆袭', '反杀'];
    }

    for (const word of actionWords) {
      const title = place + word;
      if (isValidTitle(title)) {
        candidates.push({
          title,
          style: 'template-place-genre-action',
          score: 77,
          reason: `模板：{地点}{动作} → ${title}`,
        });
        break;
      }
    }
  }

  // 模板4：宝物 + 题材专属动作（玄幻/仙侠）
  if (elements.treasures.length > 0) {
    const treasure = elements.treasures[0];
    const actionWords = genreKey === 'xuanhuan' || genreKey === 'xianxia'
      ? ['夺宝', '争夺', '炼化', '觉醒', '认主']
      : ['争夺', '发现', '得到', '使用'];
    
    for (const word of actionWords) {
      const title = treasure.slice(0, 4) + word;
      if (isValidTitle(title)) {
        candidates.push({
          title,
          style: 'template-treasure-action',
          score: 75,
          reason: `模板：{宝物}{动作} → ${title}`,
        });
        break;
      }
    }
  }

  // 模板5：悬念词结尾
  if (elements.suspensePoints.length > 0) {
    const suspense = elements.suspensePoints[0];
    if (isValidTitle(suspense)) {
      candidates.push({
        title: suspense,
        style: 'template-suspense',
        score: 75,
        reason: `模板：悬念词 → ${suspense}`,
      });
    }
  }

  // 模板6：并列意象（地点+动作或动作+动作）
  if (elements.places.length > 0 && elements.coreActions.length >= 2) {
    const place = elements.places[0].slice(0, 2);
    const action1 = elements.coreActions[0];
    const action2 = elements.coreActions[1];
    const title = `${place}${action1}与${action2}`;
    if (isValidTitle(title) && title.length <= 10) {
      candidates.push({
        title,
        style: 'template-juxtaposition-action',
        score: 73,
        reason: `模板：并列动作 → ${title}`,
      });
    }
  }

  // 模板7：危机+动作（都市题材）
  if (genreKey === 'urban' && elements.conflicts.length > 0 && elements.coreActions.length > 0) {
    const conflict = elements.conflicts[0];
    const action = elements.coreActions[0];
    const title = conflict + action;
    if (isValidTitle(title)) {
      candidates.push({
        title,
        style: 'template-conflict-action',
        score: 74,
        reason: `模板：{危机}{动作} → ${title}`,
      });
    }
  }

  return candidates;
}

function generateJuxtapositionTitles(elements: ExtractedElements): TitleCandidate[] {
  const candidates: TitleCandidate[] = [];

  for (let i = 0; i < elements.juxtapositionPairs.length; i++) {
    const pair = elements.juxtapositionPairs[i];
    if (!isValidTitle(pair)) continue;
    const bonus = i === 0 ? 3 : 0;
    candidates.push({
      title: pair,
      style: 'juxtaposition',
      score: 69 + bonus,
      reason: `并列对仗：${pair}`,
    });
  }

  return candidates;
}

/**
 * 标题质量加分：意象感、悬念感、独特性等维度的正向加分
 * 在基础分之上额外加分，用于排序时提升好标题的优先级
 */
function computeQualityBonus(title: string): number {
  let bonus = 0;

  // XXvsXX模式扣分（套路化格式）
  if (/^[\u4e00-\u9fa5]{2,4}vs[\u4e00-\u9fa5]{2,4}$/.test(title)) {
    bonus -= 15;
  }

  // 长度最佳（4-6字加分最多，2-3字次之，7-8字也还可以）
  if (title.length >= 4 && title.length <= 6) bonus += 4;
  else if (title.length === 3 || title.length === 7) bonus += 2;
  else if (title.length === 2 || title.length === 8) bonus += 1;

  // 意象感：含环境/意象词加分
  for (const noun of ATMOSPHERE_NOUNS) {
    if (title.includes(noun)) {
      bonus += 3;
      break;
    }
  }
  for (const adj of ATMOSPHERE_ADJECTIVES) {
    if (title.includes(adj)) {
      bonus += 2;
      break;
    }
  }

  // 悬念感：含悬念标记词加分
  const suspenseMarkers = ['谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然', '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇', '惊人', '震撼'];
  for (const marker of suspenseMarkers) {
    if (title.includes(marker)) {
      bonus += 4;
      break;
    }
  }

  // 动作感：含高价值动词加分
  for (const verb of HIGH_VALUE_VERBS) {
    if (title.includes(verb)) {
      bonus += 3;
      break;
    }
  }

  // === 网文风格标题加分 ===

  // 悬念型标题加分（以悬念词开头）
  const suspensePrefixes = ['谁', '什么', '为何', '怎么', '哪里', '莫非', '难道', '竟然', '居然', '原来', '真相', '秘密', '神秘', '诡异', '离奇'];
  if (suspensePrefixes.some(p => title.startsWith(p))) {
    bonus += 6;
  }

  // 反转型标题加分（打脸/逆袭等爆点词）
  const reversalWords = ['反转', '打脸', '逆袭', '反杀', '翻盘', '震惊', '轰动', '沸腾', '傻眼', '惊呆', '吓傻', '崩溃', '炸裂', '爆了', '燃了'];
  if (reversalWords.some(w => title.includes(w))) {
    bonus += 5;
  }

  // 对话型标题加分（以对话前缀开头）
  const dialogPrefixes = ['你', '我', '他', '她说', '他说', '我说', '有人说', '众人道'];
  if (dialogPrefixes.some(p => title.startsWith(p))) {
    bonus += 4;
  }

  // 爆点型标题加分（震惊/炸裂等）
  const shockWords = ['震惊', '轰动', '震撼', '沸腾', '哗然', '炸裂', '爆了', '燃了', '疯狂', '逆天', '恐怖', '无敌', '神级'];
  if (shockWords.some(w => title.includes(w))) {
    bonus += 3;
  }

  // 独特性：避免"XX的XX"过于通用的句式（非意象组合的轻微扣分）
  if (/^.{2,3}的.{2,3}$/.test(title)) {
    let hasAtmosphere = false;
    for (const noun of ATMOSPHERE_NOUNS) {
      if (title.includes(noun)) { hasAtmosphere = true; break; }
    }
    if (!hasAtmosphere) bonus -= 2;
  }

  return bonus;
}

function buildFallbackTitle(content: string, chapterNumber: number): string {
  const paragraphs = content.split(/\n+/u).filter(p => p.trim().length > 0);
  for (const paragraph of paragraphs.slice(0, 10)) {
    let clean = sanitizeTitleCandidate(paragraph);
    // 遇到"已经/便/就/才"等中间副词时截断到副词前，避免残句
    clean = trimAtIncompleteMiddle(clean);
    if (isValidTitle(clean) && clean.length >= 4 && clean.length <= 8) {
      return clean;
    }
  }
  return `第${chapterNumber}章`;
}

/**
 * 遇到"已经/便/就/才"等中间副词时截断到副词前。
 * 例：「沈忠已经做好了决断」→「沈忠」
 * 如果截断后过短（<4字）则返回空字符串，让上层丢弃该候选。
 */
function trimAtIncompleteMiddle(title: string): string {
  const incompleteMidWords = ['已经', '便就', '便', '就', '才', '曾', '正要', '刚要', '刚', '正', '将', '欲', '还', '尚'];
  for (const word of incompleteMidWords) {
    const idx = title.indexOf(word);
    if (idx > 0) {
      const trimmed = title.slice(0, idx);
      if (trimmed.length >= 4) return trimmed;
      return '';
    }
  }
  return title;
}
