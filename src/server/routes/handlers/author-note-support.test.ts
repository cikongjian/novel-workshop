import { describe, expect, it, vi } from 'vitest';
import {
  appendAuthorNote,
  buildAuthorNoteContext,
  generateAuthorNote,
  persistAuthorNote,
  resolveAuthorNoteDeletion,
  sanitizeAuthorNote,
} from './author-note-support.js';

describe('author note support', () => {
  it('builds author note context with truncation and reader hint', () => {
    const context = buildAuthorNoteContext({
      novel: {
        id: 'novel-1',
        genre: '玄幻',
        title: '赤焰长歌',
        synopsis: '旧案再起',
      },
      chapter: {
        content: '甲'.repeat(2100),
        agentComments: [{
          agentRole: 'reader',
          comment: '读者反馈'.repeat(200),
          timestamp: '2026-03-23T00:00:00.000Z',
        }],
        authorNotes: ['上一条'],
      } as any,
      chapterNumber: 7,
      nextOutlineSummary: '下章提示'.repeat(100),
      userDirection: '要更有互动感',
    });

    expect(context.inputText?.length).toBe(2001);
    expect(context.inputText?.endsWith('…')).toBe(true);
    expect(context.userDirection).toContain('参考读者评价');
    expect(context.userDirection).toContain('要更有互动感');
    expect(context.outlineContext?.length).toBe(201);
    expect(context.outlineContext?.endsWith('…')).toBe(true);
    expect(context.existingAuthorNotes).toEqual(['上一条']);
  });

  it('generates author note and broadcasts lifecycle events', async () => {
    const broadcast = vi.fn();
    const agent = {
      execute: vi.fn().mockImplementation(async (_context, _client, onChunk) => {
        onChunk?.('片段');
        return {
          agentRole: 'author-note-writer',
          content: ' 作者有话说 ',
          timestamp: '2026-03-23T00:00:01.000Z',
        };
      }),
    };

    const authorNote = await generateAuthorNote({
      agent: agent as any,
      client: {} as any,
      context: { novelId: 'novel-1', genre: '', novelTitle: '赤焰长歌', novelSynopsis: '' },
      novelId: 'novel-1',
      chapterNumber: 7,
      broadcast,
    });

    expect(authorNote).toBe('作者有话说');
    expect(broadcast).toHaveBeenCalledTimes(3);
    expect(broadcast.mock.calls[0]?.[0]?.type).toBe('agent:start');
    expect(broadcast.mock.calls[1]?.[0]?.type).toBe('agent:chunk');
    expect(broadcast.mock.calls[2]?.[0]?.type).toBe('agent:complete');
  });

  it('removes author meta-explanation lines from generated notes', () => {
    expect(sanitizeAuthorNote([
      '（腼腆青年）',
      '',
      '这碗汤热得我不敢抬头。',
      '',
      '——来自作者的补充：这个角色其实很让人心疼。',
    ].join('\n'))).toBe('（腼腆青年）\n\n这碗汤热得我不敢抬头。');
  });

  it('removes writing-process sentences without dropping useful reader-facing notes', () => {
    expect(sanitizeAuthorNote([
      '追更的各位好，',
      '',
      '今天写第2章的时候，我忍不住想起前两年去参观朋友公司展厅的经历。那时候他们刚做完改造，负责项目的姑娘蹲在墙角摸了一圈地脚线，站起来说“这里受潮了”。所以写林澄蹲下去按地脚线那段，我几乎是原样搬过来的。',
      '',
      '下章项目正式启动，有人要开始坐不住了。',
    ].join('\n'))).toBe([
      '追更的各位好，',
      '那时候他们刚做完改造，负责项目的姑娘蹲在墙角摸了一圈地脚线，站起来说“这里受潮了”。',
      '下章项目正式启动，有人要开始坐不住了。',
    ].join('\n\n'));
  });

  it('removes revision-process sentences from Q&A style notes', () => {
    expect(sanitizeAuthorNote([
      '问：“这个电源改造解决得太顺了吧？”',
      '',
      '答：说实话，写这段的时候我反复删了三遍。按正常职场流程，物业配合单至少要跑三天。真正的主角光环不是一切顺利，而是发现某一个环节卡住时，已经有B方案在包里叠好。',
    ].join('\n'))).toBe([
      '问：“这个电源改造解决得太顺了吧？”',
      '答：按正常职场流程，物业配合单至少要跑三天。真正的主角光环不是一切顺利，而是发现某一个环节卡住时，已经有B方案在包里叠好。',
    ].join('\n\n'));
  });

  it('removes research and spoiler meta-talk from casual notes', () => {
    expect(sanitizeAuthorNote([
      '有没有人想问：“修模型那段是不是编的？你一个写小说的懂什么？”',
      '',
      '从铜丝折弯到瞬干胶预定位，我甚至连装甲缝打磨该用多少目砂纸都查了。但林浅拿起红异端翻来覆去摸的那段，老实说是我自己脑补的。如果你是真的胶佬，评论区别骂太狠直接告诉我就行。',
      '',
      '他确实不是路过。不好意思，这里不能剧透。',
    ].join('\n'))).toBe([
      '如果你是真的胶佬，评论区别骂太狠直接告诉我就行。',
      '他确实不是路过。',
    ].join('\n\n'));
  });

  it('removes bracketed author asides from character-view notes', () => {
    expect(sanitizeAuthorNote([
      '（林浅视角）',
      '',
      '这位社长啊，真的是……我明明只是来修个柜子的，怎么就把自己搭进去了呢。',
      '',
      '（作者小声：林浅同学你确定你是“被搭进去”的吗？你那钥匙环转得可欢了。）',
    ].join('\n'))).toBe([
      '（林浅视角）',
      '这位社长啊，真的是……我明明只是来修个柜子的，怎么就把自己搭进去了呢。',
    ].join('\n\n'));
  });

  it('removes author whisper variants with extra wording', () => {
    expect(sanitizeAuthorNote([
      '（林霄视角）',
      '',
      '这人压根不该坐在那里。',
      '',
      '（作者小声补一句：林霄嘴硬，但心服的时候也痛快。）',
    ].join('\n'))).toBe([
      '（林霄视角）',
      '这人压根不该坐在那里。',
    ].join('\n\n'));
  });

  it('removes author insert asides from character-view romance notes', () => {
    expect(sanitizeAuthorNote([
      '（顾砚舟视角）',
      '',
      '便利贴上我写的“8:00”，她写的“等花开”。她塞给我那张“等花开”的时候，指尖碰到衬衫布料，就那么一下，我呼吸好像顿了半拍。',
      '',
      '（作者插一句：顾砚舟你完了，知道吗？他刚才写这段的时候一直在哼歌，我发誓是真的。）',
    ].join('\n'))).toBe([
      '（顾砚舟视角）',
      '便利贴上我写的“8:00”，她写的“等花开”。她塞给我那张“等花开”的时候，指尖碰到衬衫布料，就那么一下，我呼吸好像顿了半拍。',
    ].join('\n\n'));
  });

  it('removes first-person writing-process talk and author signature', () => {
    expect(sanitizeAuthorNote([
      '致还在追更的各位：',
      '',
      '沈知夏蹲在破庙门口，用碎瓦片刮锅底那个画面，我反复想象了好几遍——一个姑娘逃荒到一无所有，唯一的本钱是奶奶留的一口铸铁锅。',
      '有人说第一章节奏有点慢，但我觉得这种“慢”是值得的。',
      '我自己最喜欢的是那个老农尝汤的片段。两枚铜板落在掌心的时候，那不只是钱，是一口喘息的机会。',
      '还有赵掌柜最后那个青辣酱的伏笔——酸汤面只是开始。',
      '野葱是从我小时候在老家后山拔过的记忆里薅来的。',
      '要是我，蹲在粮铺门口大概得犹豫半天。',
      '沈知夏先开口请他尝面那一下，是我整章写下来最舒服的地方。',
      '',
      '爱你们的作者',
    ].join('\n'))).toBe([
      '致还在追更的各位：',
      '两枚铜板落在掌心的时候，那不只是钱，是一口喘息的机会。',
      '还有赵掌柜最后那个青辣酱的伏笔——酸汤面只是开始。',
    ].join('\n\n'));
  });

  it('rejects follow-up chatter and author-signature style notes', () => {
    expect(sanitizeAuthorNote([
      '各位追更的朋友：',
      '',
      '这章写的是林澄周六一早跑现场，电缆管廊、弱电架、封死的墙洞，全是实打实的硬活儿。',
      '有朋友在后台问：她是不是有点冷淡？下章墙洞打通之后会发生什么，我只能说，设计部那个评审意见有点意思。',
      '',
      '谢谢还在追更的你们。',
      '',
      '林澄的熬夜纪录员 敬上',
    ].join('\n'))).toBe('');
  });

  it('rejects reader-self-insert chatter that weakens the public surface', () => {
    expect(sanitizeAuthorNote('赵宏的消息，林澄没点开——比点开更让人悬着心。是我我也憋着，但憋着才更想知道啊。'))
      .toBe('');
    expect(sanitizeAuthorNote('换成我也忍不住想点开，但林澄偏偏把手机扣下了。'))
      .toBe('');
  });

  it('rejects comment-bait and coding-signoff chatter from generated notes', () => {
    expect(sanitizeAuthorNote([
      '亲爱的各位：',
      '',
      '这章写得特别顺，就像许知夏和赵明轩自然而然就走到了梧桐树下。你们有没有那种“明明很努力但就是做不好手工”的经历？有的话扣1，让我知道我不是一个人（笑）。',
      '箱子里的零件又是什么？我只能说，下章你们会知道的，而且是惊喜。',
      '好了，我继续去码字了，明天见。',
      '',
      '你们的南瓜',
    ].join('\n'))).toBe('');
  });

  it('rejects long explanatory bullet notes that read like recap or spoiler commentary', () => {
    expect(sanitizeAuthorNote([
      '· 一个红圈，一段数据链。是不是觉得这个“断电恢复阈值”的退回很眼熟？这种巧合，在职场里从来不是巧合。',
      '',
      '· SC-04。这个编号将来会在验收报告里被反复引用。',
      '',
      '· 设计部刘莉那句话背后是一个三年前滨江项目的旧模板。',
      '',
      '· 冷知识一条：那张纸保存得格外完好。',
    ].join('\n'))).toBe('');
  });

  it('rejects author Q&A that explains ability design and previews later reveals', () => {
    expect(sanitizeAuthorNote([
      '问：“沈眠这能力是不是太bug了？倒计时预警还精准到秒，别人还玩什么？”',
      '答：你抓到点了。这能力确实像开挂，但第一章只是能力曝光的开场，后面你会看到——提前知道不等于能拦住，能力的副作用和代价会在后续慢慢揭。',
      '',
      '问：“赵允薇好惨，作者你是不是跟这位姐有仇？”',
      '答：真没有。赵允薇这条线在后面不是工具人，具体我先不说。',
    ].join('\n'))).toBe('');
  });

  it('rejects author teaser phrasing that previews the next hook out of voice', () => {
    expect(sanitizeAuthorNote('我只能说，那根骨棍插下去之后，灶台底下有东西开始活了。')).toBe('');
    expect(sanitizeAuthorNote('只能说，赵宏这条消息后面还有更大的坑。')).toBe('');
  });

  it('rejects fabricated internship and mentor anecdotes', () => {
    expect(sanitizeAuthorNote('以前在化工厂实习的时候，带我的师傅姓郑，他教我先检查接地线。')).toBe('');
  });

  it('rejects author self-reaction and fast-forward teaser notes', () => {
    expect(sanitizeAuthorNote('草蛇灰线埋到现在，自己回头翻都起鸡皮疙瘩。真想快进到明天。')).toBe('');
  });

  it('keeps character-view first-person notes when they are not author chatter', () => {
    expect(sanitizeAuthorNote([
      '（林澄视角）',
      '',
      '我把手机扣下去的时候，其实已经知道赵宏不会只发这一条。',
      '',
      '会议室白板上那串数字还没擦，压力也没有散。',
    ].join('\n'))).toBe([
      '（林澄视角）',
      '我把手机扣下去的时候，其实已经知道赵宏不会只发这一条。',
      '会议室白板上那串数字还没擦，压力也没有散。',
    ].join('\n\n'));
  });

  it('removes author-process talk from food-business notes', () => {
    expect(sanitizeAuthorNote([
      '追更的各位好：',
      '',
      '王守田接过那碗剩汤的时候，我比沈知夏还紧张——里正要是嫌脏不接，这局就破了。结果他接了，还喝了。那一口咽下去，嘴唇动的那一下，比啥台词都好使。',
      '',
      '今天这章里赵掌柜明明没输，但我写他掐旱烟杆时格外来劲。大概是因为人到中年，最能感同身受的，就是这种“好气哦但还不能翻脸”的憋屈。',
      '',
      '挑夫们今天的出场方式是“从粥摊站起来”——我自己写着写着就笑了，这是人类面对美食最真实的忠诚转移，闻着味儿就叛变了。',
      '',
      '灰布衫老汉自带陶罐来打包那一下，其实我本来写的是“用油纸包”，后来改成陶罐。油纸是远方，陶罐才是过日子的人家。这碗汤带回家还能热一顿，就是多了一顿饭钱。',
      '',
      '最后那条赌约，实不相瞒，我一开始写的数字是三十碗，后来改成二十。别问我为什么——二十碗刚好能在天亮前卖完，三十碗就超出主角当前体力值了。写种田文最大的快乐，大概就是计算器终于有了用武之地。',
    ].join('\n'))).toBe([
      '追更的各位好：',
      '结果他接了，还喝了。那一口咽下去，嘴唇动的那一下，比啥台词都好使。',
      '大概是因为人到中年，最能感同身受的，就是这种“好气哦但还不能翻脸”的憋屈。',
      '二十碗刚好能在天亮前卖完，三十碗就超出主角当前体力值了。',
    ].join('\n\n'));
  });

  it('keeps author notes compact so they do not dilute the chapter ending', () => {
    const sanitized = sanitizeAuthorNote([
      '（赵掌柜蹲在粥车后面，搅着锅底那点快要煮烂的粥，眼皮一抬，看了一眼对面那排空碗。）',
      '',
      '（他嘴角动了动，没吭声。）',
      '',
      '（砸吧一口旱烟，烟雾从鼻腔里喷出来，他看那几个挑夫蹲在墙根，碗底朝天，端着粥碗凑到沈知夏灶台边。）',
      '',
      '（这小娘子，有两下子。押碗，押金，退碗退钱，缺一口碗都能把摊子支棱起来。）',
      '',
      '（但他不说话。他赵掌柜卖粥卖了三年，镇口这条路，他推着粥车走了八百多趟。）',
      '',
      '（明天。明天他得换个位置。）',
    ].join('\n'));

    expect(Array.from(sanitized).length).toBeLessThanOrEqual(380);
    expect(sanitized.split(/\n+/u).filter(Boolean).length).toBeLessThanOrEqual(4);
    expect(sanitized).toContain('明天他得换个位置');
  });

  it('removes today-chapter writing-process phrasing', () => {
    expect(sanitizeAuthorNote('今天这章写下来，最过瘾的不是收了多少铜板，是老汉放下花椒转身就走的那瞬间。日子啊，就是这样一点点厚起来的。'))
      .toBe('日子啊，就是这样一点点厚起来的。');
  });

  it('removes private-memory asides from reader-facing notes', () => {
    expect(sanitizeAuthorNote([
      '那家店开在街角，老板姓陈，煮面用的是一口黑铁锅。',
      '我那时候零花钱少，一碗面两块钱，吃一顿得攒三天。',
      '后来我才知道，他定这规矩不是心疼那五毛碗筷钱，是心疼那些在镇上打零工的人。',
      '我见过一个带孩子的女人，每次来都拿只搪瓷碗，自己不舍得吃。',
      '后来那家面馆拆了，我再也没见过陈叔，但“自带碗减一文”这个细节我一直记着。',
      '自带碗减一文，是沈知夏把规则压回日子里的第一步。',
    ].join('\n'))).toBe([
      '自带碗减一文，是沈知夏把规则压回日子里的第一步。',
    ].join('\n\n'));
  });

  it('removes childhood-memory process notes while preserving story-facing flavor notes', () => {
    expect(sanitizeAuthorNote([
      '写花椒断货那段时，突然想起一件旧事。',
      '小时候我家隔壁住着一位北方老太太，每年秋天都要腌一缸酸菜，还往里扔几粒花椒。',
      '我问她为什么要放花椒，她说“这东西啊，是便宜又好用的镇场子料。”',
      '那个冬天我去她家吃饭，酸菜汤确实是辣了，但总觉得少了点什么。',
      '后来有一年花椒大涨价，她在菜市场里转了三圈没舍得买。',
      '花椒这东西，真的不是随便就能替的，可人总有办法——野葱也好、干椒也罢，总有什么东西能在缺了的时候顶上。',
      '野葱酸汤不是原来的味道，但至少这一日没断味。',
    ].join('\n'))).toBe([
      '花椒这东西，真的不是随便就能替的，可人总有办法——野葱也好、干椒也罢，总有什么东西能在缺了的时候顶上。',
      '野葱酸汤不是原来的味道，但至少这一日没断味。',
    ].join('\n\n'));
  });

  it('removes school-age private memory while preserving story-facing residue', () => {
    expect(sanitizeAuthorNote([
      '他的摊上立着一块木板，用粉笔写着“自带碗减一块”，字写得歪歪扭扭，但十多年了从来没擦掉过。',
      '我从小学一直吃到高中，每次去都端着自己家的搪瓷碗。',
      '有一回期末考试考砸了，我妈骂完我，我躲到面摊去，周叔看了我一眼，给我那碗面条里卧了个荷包蛋，说“送你个蛋，补补脑子。”',
      '我说你亏了啊。',
      '他手里的漏勺搅了搅锅，头也没抬：“减的那一块钱，够买半个蛋了，你记不记得你第一次来，端的是个豁口的蓝边碗？那碗是你爸喝稀饭用的吧。”',
      '那时候一碗面三块钱，减一块对很多人来说就是一顿饭的差价。',
      '但“自带碗减一块”这六个字，我到现在都还记得。',
      '穷日子里的一文钱，真的就是撑下去的关键。',
    ].join(''))).toBe('穷日子里的一文钱，真的就是撑下去的关键。');
  });

  it('drops notes that still expose writing process after sanitization', () => {
    expect(sanitizeAuthorNote([
      '亲爱的各位：',
      '',
      '她那会儿满脑子就是读数、信号、脉冲间隔，真正的紧张不是喊出来，而是盯住那个3.3V的脉冲。',
      '',
      '说实话，我自己干过的活跟维修沾点边，大学暑假在空调厂待过两个月，后来就下意识带进叶澜这个角色里了。',
      '',
      '维修员·叶澜（代签）',
    ].join('\n'))).toBe('');
  });

  it('drops meta narration about the author inventing or pausing over the story', () => {
    expect(sanitizeAuthorNote([
      '亲爱的各位，',
      '',
      '你们看的时候会不会也有那种感觉，就是某个情节不是作者“编”出来的，而是故事自己长出来的。',
      '许知夏说“不等人”的时候我停了笔看了很久那句话，她身上有一种让我这个作者都意外的果断。',
      '',
      '下一章，器材室的三十五分钟，借不借得到那根传动轴，去看看吧。',
    ].join('\n'))).toBe('');
  });

  it('drops chapter-process bullet notes with deleted-draft talk', () => {
    expect(sanitizeAuthorNote([
      '· 这一章写到的放气口内壁“点状锈斑”，其实质是模拟了一种工程现象。',
      '',
      '· 取样瓶那段操作有个小彩蛋——其实原文删了一句话，这种细节太折磨节奏，掐掉了。',
      '',
      '· 你注意到那四颗螺栓里有两颗是被不同规格的工具拧过的吗？',
    ].join('\n'))).toBe('');
  });

  it('rejects quality-score and reader-feedback meta commentary from generated notes', () => {
    expect(sanitizeAuthorNote([
      '· 白扎带是全章出镜率最高的道具，也是全章最安静的角色。',
      '',
      '它在正文里只出现了一次，大概三行字，但它其实是整章最危险的信号。',
      '',
      '· 这一章的情感分从读者反馈来看确实偏低，我承认。下一章我会试着让情绪在行动里再露一点头。',
      '',
      '· 你们有没有注意过自己门上或者柜子上的白色扎带？这一章的提问是：你手上有没有哪件东西舍不得丢？',
    ].join('\n'))).toBe('');
  });

  it('caps author note history and persists latest notes', async () => {
    const saveChapter = vi.fn();
    const chapter = {
      novelId: 'novel-1',
      chapterNumber: 7,
      title: '第七章',
      content: '正文',
      wordCount: 2,
      status: 'edited',
      agentComments: [],
      revisionCount: 0,
      authorNotes: Array.from({ length: 20 }, (_, index) => `note-${index}`),
      createdAt: '2026-03-22T00:00:00.000Z',
      updatedAt: '2026-03-22T00:00:00.000Z',
      summary: '',
    } as any;

    const updatedNotes = await persistAuthorNote({
      novelManager: { saveChapter } as any,
      novelId: 'novel-1',
      chapter,
      authorNote: 'latest-note',
    });

    expect(appendAuthorNote(chapter.authorNotes, 'latest-note')).toHaveLength(20);
    expect(updatedNotes[0]).toBe('note-1');
    expect(updatedNotes[19]).toBe('latest-note');
    expect(saveChapter).toHaveBeenCalledOnce();
  });

  it('resolves targeted deletion and index validation', () => {
    expect(resolveAuthorNoteDeletion({
      existingNotes: ['a', 'b', 'c'],
      index: 1,
    })).toEqual({ updatedNotes: ['a', 'c'] });

    expect(resolveAuthorNoteDeletion({
      existingNotes: ['a'],
      index: 2,
    }).error).toBe('索引越界');

    expect(resolveAuthorNoteDeletion({
      existingNotes: ['a', 'b'],
    })).toEqual({ updatedNotes: [] });
  });
});
