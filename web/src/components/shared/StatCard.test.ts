// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StatCard from './StatCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(StatCard, { props: { label: '总作品数', value: 12, ...props } });
}

describe('StatCard 内容', () => {
  it('渲染数值与标签', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.nw-stat-card__value').text()).toBe('12');
    expect(wrapper.find('.nw-stat-card__label').text()).toBe('总作品数');
  });

  it('数值支持字符串', () => {
    const wrapper = mountCard({ value: '1.2 万' });
    expect(wrapper.find('.nw-stat-card__value').text()).toBe('1.2 万');
  });

  it('数值为 0 时仍然渲染而非被当作空值', () => {
    const wrapper = mountCard({ value: 0 });
    expect(wrapper.find('.nw-stat-card__value').text()).toBe('0');
  });

  it('未提供 hint 时不渲染提示区', () => {
    expect(mountCard().find('.nw-stat-card__hint').exists()).toBe(false);
  });

  it('提供 hint 时渲染提示区', () => {
    const wrapper = mountCard({ hint: '较上周 +8%' });
    expect(wrapper.find('.nw-stat-card__hint').text()).toBe('较上周 +8%');
  });

  it('hint 为空串时不渲染提示区', () => {
    expect(mountCard({ hint: '' }).find('.nw-stat-card__hint').exists()).toBe(false);
  });
});

describe('StatCard 图标与配色', () => {
  it('默认图标为 layers、默认色调为 indigo', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.nw-stat-card__icon--indigo').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'Icon' }).props('name')).toBe('layers');
  });

  it('可指定图标', () => {
    const wrapper = mountCard({ icon: 'book' });
    expect(wrapper.findComponent({ name: 'Icon' }).props('name')).toBe('book');
  });

  it('四种色调都映射到对应修饰类', () => {
    for (const accent of ['indigo', 'sky', 'emerald', 'amber'] as const) {
      const wrapper = mountCard({ accent });
      expect(wrapper.find(`.nw-stat-card__icon--${accent}`).exists()).toBe(true);
    }
  });

  it('图标以 22px 渲染', () => {
    const wrapper = mountCard();
    expect(wrapper.findComponent({ name: 'Icon' }).props('size')).toBe(22);
  });
});
