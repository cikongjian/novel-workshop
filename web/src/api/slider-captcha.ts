import { http } from './http';

export interface SliderChallengeResponse {
  challengeId: string;
  trackWidth: number;
  expiresIn: number;
}

export const sliderCaptchaApi = {
  generate: () =>
    http.get<SliderChallengeResponse>('/slider-captcha/generate').then((r) => r.data),
};
