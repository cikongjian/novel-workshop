// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StateView from './StateView.vue';

const DATA_SLOT = '<p class="data-content">正文数据</p>';

function mountStateView(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(StateView, {
    props,
    slots: { default: DATA_SLOT, ...slots },
  });
}

describe('StateView 四态优先级', () => {
  it('默认渲染数据插槽', () => {
    const wrapper = mountStateView();
    expect(wrapper.find('.data-content').exists()).toBe(true);
    expect(wrapper.find('.nw-state').exists()).toBe(false);
  });

  it('loading 优先于其他状态', () => {
    const wrapper = mountStateView({ loading: true, error: new Error('x'), empty: true });
    expect(wrapper.find('.nw-state--loading').exists()).toBe(true);
    expect(wrapper.find('.nw-state--error').exists()).toBe(false);
    expect(wrapper.find('.data-content').exists()).toBe(false);
  });

  it('error 优先于 empty', () => {
    const wrapper = mountStateView({ error: new Error('boom'), empty: true });
    expect(wrapper.find('.nw-state--error').exists()).toBe(true);
    expect(wrapper.find('.nw-state--empty').exists()).toBe(false);
  });

  it('empty 优先于数据插槽', () => {
    const wrapper = mountStateView({ empty: true });
    expect(wrapper.find('.nw-state--empty').exists()).toBe(true);
    expect(wrapper.find('.data-content').exists()).toBe(false);
  });

  it('任意 truthy error 都进入错误态', () => {
    for (const error of ['出错了', 1, {}, new Error('x')]) {
      const wrapper = mountStateView({ error });
      expect(wrapper.find('.nw-state--error').exists()).toBe(true);
    }
  });

  it('error 为 null 或 undefined 时不进入错误态', () => {
    for (const error of [null, undefined, false, 0, '']) {
      const wrapper = mountStateView({ error });
      expect(wrapper.find('.nw-state--error').exists()).toBe(false);
    }
  });
});

describe('StateView 文案', () => {
  it('加载文案默认为「加载中…」', () => {
    expect(mountStateView({ loading: true }).text()).toContain('加载中');
  });

  it('可自定义加载文案', () => {
    const wrapper = mountStateView({ loading: true, loadingText: '正在生成章节' });
    expect(wrapper.text()).toContain('正在生成章节');
  });

  it('错误标题默认为「加载失败」', () => {
    expect(mountStateView({ error: new Error('x') }).text()).toContain('加载失败');
  });

  it('可自定义错误标题与信息', () => {
    const wrapper = mountStateView({
      error: new Error('x'),
      errorTitle: '生成失败',
      errorMessage: '积分不足',
    });
    expect(wrapper.text()).toContain('生成失败');
    expect(wrapper.text()).toContain('积分不足');
  });

  it('未提供错误信息时不渲染信息段', () => {
    const wrapper = mountStateView({ error: new Error('x') });
    expect(wrapper.find('.nw-state__desc').exists()).toBe(false);
  });

  it('空态默认文案为「暂无内容」', () => {
    expect(mountStateView({ empty: true }).text()).toContain('暂无内容');
  });
});

describe('StateView 插槽覆盖', () => {
  it('loading 插槽可替换默认指示', () => {
    const wrapper = mountStateView(
      { loading: true },
      { loading: '<div class="custom-skeleton">骨架</div>' },
    );
    expect(wrapper.find('.custom-skeleton').exists()).toBe(true);
    expect(wrapper.find('.nw-state__spinner').exists()).toBe(false);
  });

  it('empty 插槽可替换默认空态', () => {
    const wrapper = mountStateView(
      { empty: true },
      { empty: '<div class="custom-empty">还没有作品</div>' },
    );
    expect(wrapper.find('.custom-empty').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('暂无内容');
  });
});

describe('StateView retry 事件', () => {
  it('点击重试按钮抛出 retry', async () => {
    const wrapper = mountStateView({ error: new Error('x') });
    await wrapper.find('.nw-state__retry').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('多次点击各抛出一次', async () => {
    const wrapper = mountStateView({ error: new Error('x') });
    const button = wrapper.find('.nw-state__retry');
    await button.trigger('click');
    await button.trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(2);
  });

  it('非错误态不存在重试按钮', () => {
    expect(mountStateView({ loading: true }).find('.nw-state__retry').exists()).toBe(false);
    expect(mountStateView({ empty: true }).find('.nw-state__retry').exists()).toBe(false);
    expect(mountStateView().find('.nw-state__retry').exists()).toBe(false);
  });
});
