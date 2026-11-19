import { DefaultRenderingPipeline, DepthOfFieldEffectBlurLevel, ImageProcessingConfiguration, SSAO2RenderingPipeline, type Camera, type Scene } from '@babylonjs/core';
import { POST, type QualityPreset } from '../config/graphics';

const MILLIMETRES = 1000;

/** Post-processing stack: SSAO, bloom, depth of field, FXAA or MSAA, ACES tone mapping and vignette. */
export class PostFx {
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private dofAllowed = false;

  constructor(private readonly scene: Scene, private readonly camera: Camera) {}

  apply(q: QualityPreset): void {
    this.pipeline?.dispose();
    this.ssao?.dispose();
    this.ssao = null;
    // SSAO first so ambient occlusion is applied in linear HDR, before tone mapping.
    if (q.ssao && SSAO2RenderingPipeline.IsSupported) {
      const ssao = new SSAO2RenderingPipeline('ssao', this.scene, { ssaoRatio: q.ssaoRatio, blurRatio: 1 }, [this.camera]);
      ssao.radius = POST.ssaoRadius;
      ssao.totalStrength = POST.ssaoStrength;
      ssao.base = POST.ssaoBase;
      ssao.samples = q.ssaoSamples;
      ssao.maxZ = POST.ssaoMaxZ;
      ssao.expensiveBlur = true;
      this.ssao = ssao;
    }
    const p = new DefaultRenderingPipeline('post', true, this.scene, [this.camera]);
    p.samples = q.msaaSamples;
    p.fxaaEnabled = q.fxaa;
    p.bloomEnabled = q.bloom;
    p.bloomThreshold = POST.bloomThreshold;
    p.bloomWeight = POST.bloomWeight;
    p.bloomKernel = POST.bloomKernel;
    p.bloomScale = POST.bloomScale;
    this.dofAllowed = q.depthOfField;
    p.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.Low;
    p.depthOfFieldEnabled = q.depthOfField;
    p.depthOfField.focalLength = POST.dofFocalLength;
    p.depthOfField.fStop = POST.dofFStop;
    p.depthOfField.lensSize = POST.dofLensSize;
    p.imageProcessingEnabled = true;
    const ip = p.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = POST.exposure;
    ip.contrast = POST.contrast;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = POST.vignetteWeight;
    ip.vignetteStretch = POST.vignetteStretch;
    this.pipeline = p;
  }

  /** Focuses the lens at a distance in metres; `enabled` turns the blur off for flat views. */
  focus(distance: number, enabled: boolean): void {
    const p = this.pipeline;
    if (!p) return;
    const on = this.dofAllowed && enabled;
    if (p.depthOfFieldEnabled !== on) p.depthOfFieldEnabled = on;
    if (on) p.depthOfField.focusDistance = distance * MILLIMETRES;
  }
}
