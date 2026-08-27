// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import Modal from './Modal.vue';

const BODY_SLOT = '<p class="modal-content">弹窗正文</p>';

function mountModal(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(Modal, {
    props: { modelValue: true, ...props },
    slots: { default: BODY_SLOT, ...slots },
    attachTo: document.body,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Modal 显隐', () => {
  it('modelValue 为真时渲染遮罩与内容', () => {
    mountModal();
    expect(document.body.querySelector('.nw-modal-overlay')).not.toBeNull();
    expect(document.body.querySelector('.modal-content')).not.toBeNull();
  });

  it('modelValue 为假时不渲染', () => {
    mountModal({ modelValue: false });
    expect(document.body.querySelector('.nw-modal-overlay')).toBeNull();
  });

  it('Teleport 到 body 而非组件挂载点', () => {
    const wrapper = mountModal();
    expect(document.body.querySelector('.nw-modal-panel')).not.toBeNull();
    expect(wrapper.element.querySelector?.('.nw-modal-panel') ?? null).toBeNull();
  });
});

describe('Modal 关闭契约', () => {
  it('点击关闭按钮抛出 update:modelValue false', async () => {
    const wrapper = mountModal();
    const button = document.body.querySelector('.nw-modal-close') as HTMLElement;
    button.click();
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('点击遮罩自身关闭', async () => {
    const wrapper = mountModal();
    const overlay = document.body.querySelector('.nw-modal-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('点击面板内部不关闭（click.self 语义）', async () => {
    const wrapper = mountModal();
    const panel = document.body.querySelector('.nw-modal-panel') as HTMLElement;
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('点击正文内容不关闭', async () => {
    const wrapper = mountModal();
    const content = document.body.querySelector('.modal-content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('Modal 标题与宽度', () => {
  it('渲染传入标题', () => {
    mountModal({ title: '确认删除' });
    expect(document.body.querySelector('.nw-modal-title')?.textContent).toBe('确认删除');
  });

  it('未传标题时标题节点为空', () => {
    mountModal();
    expect(document.body.querySelector('.nw-modal-title')?.textContent).toBe('');
  });

  it('默认最大宽度为 480px', () => {
    mountModal();
    const panel = document.body.querySelector('.nw-modal-panel') as HTMLElement;
    expect(panel.style.maxWidth).toBe('480px');
  });

  it('可自定义宽度', () => {
    mountModal({ width: '720px' });
    const panel = document.body.querySelector('.nw-modal-panel') as HTMLElement;
    expect(panel.style.maxWidth).toBe('720px');
  });

  it('关闭按钮带无障碍标签', () => {
    mountModal();
    expect(document.body.querySelector('.nw-modal-close')?.getAttribute('aria-label')).toBe('关闭');
  });
});

describe('Modal footer 插槽', () => {
  it('未提供 footer 时不渲染底部区域', () => {
    mountModal();
    expect(document.body.querySelector('.nw-modal-foot')).toBeNull();
  });

  it('提供 footer 时渲染底部区域', () => {
    mountModal({}, { footer: '<button class="confirm-btn">确认</button>' });
    expect(document.body.querySelector('.nw-modal-foot')).not.toBeNull();
    expect(document.body.querySelector('.confirm-btn')).not.toBeNull();
  });
});
