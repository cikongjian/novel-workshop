// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Icon from './Icon.vue';

describe('Icon 渲染', () => {
  it('已知图标渲染出 path', () => {
    const wrapper = mount(Icon, { props: { name: 'home' } });
    expect(wrapper.findAll('path').length).toBeGreaterThan(0);
  });

  it('未知图标降级为空 svg 而不报错', () => {
    const wrapper = mount(Icon, { props: { name: '不存在的图标' } });
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('path')).toHaveLength(0);
  });

  it('空名称同样降级为空 svg', () => {
    const wrapper = mount(Icon, { props: { name: '' } });
    expect(wrapper.findAll('path')).toHaveLength(0);
  });

  it('多段图标渲染出多个 path', () => {
    // settings 由 9 段组成
    const wrapper = mount(Icon, { props: { name: 'settings' } });
    expect(wrapper.findAll('path').length).toBeGreaterThan(1);
  });
});

describe('Icon 尺寸与描边', () => {
  it('默认尺寸 20、描边 2', () => {
    const svg = mount(Icon, { props: { name: 'home' } }).find('svg');
    expect(svg.attributes('width')).toBe('20');
    expect(svg.attributes('height')).toBe('20');
    expect(svg.attributes('stroke-width')).toBe('2');
  });

  it('可自定义尺寸', () => {
    const svg = mount(Icon, { props: { name: 'home', size: 32 } }).find('svg');
    expect(svg.attributes('width')).toBe('32');
    expect(svg.attributes('height')).toBe('32');
  });

  it('可自定义描边宽度', () => {
    const svg = mount(Icon, { props: { name: 'home', strokeWidth: 1.5 } }).find('svg');
    expect(svg.attributes('stroke-width')).toBe('1.5');
  });

  it('viewBox 固定为 24×24，描边继承 currentColor', () => {
    const svg = mount(Icon, { props: { name: 'home' } }).find('svg');
    expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.attributes('fill')).toBe('none');
  });

  it('对读屏隐藏（装饰性图标）', () => {
    const svg = mount(Icon, { props: { name: 'home' } }).find('svg');
    expect(svg.attributes('aria-hidden')).toBe('true');
  });
});

describe('Icon 名称切换', () => {
  it('切换名称后重新计算 path', async () => {
    const wrapper = mount(Icon, { props: { name: 'plus' } });
    const before = wrapper.findAll('path').length;
    await wrapper.setProps({ name: 'settings' });
    expect(wrapper.findAll('path').length).not.toBe(before);
  });

  it('从已知切到未知时清空 path', async () => {
    const wrapper = mount(Icon, { props: { name: 'home' } });
    expect(wrapper.findAll('path').length).toBeGreaterThan(0);
    await wrapper.setProps({ name: '未知' });
    expect(wrapper.findAll('path')).toHaveLength(0);
  });
});
