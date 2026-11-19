import { LoadAssetContainerAsync, TransformNode, type AssetContainer, type Scene } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import { assetUrl } from './textures';

/** Loads CC0 glTF props once and hands out instanced copies. Missing models are skipped. */
export class ModelLibrary {
  private readonly containers = new Map<string, AssetContainer>();

  constructor(private readonly scene: Scene) {}

  async load(names: readonly string[]): Promise<void> {
    await Promise.all(names.map(async (name) => {
      if (this.containers.has(name)) return;
      try {
        this.containers.set(name, await LoadAssetContainerAsync(assetUrl(`models/${name}/${name}.gltf`), this.scene));
      } catch (error) {
        console.warn(`Model ${name} could not be loaded; it is left out of the scenery.`, error);
      }
    }));
  }

  has(name: string): boolean {
    return this.containers.has(name);
  }

  /** A new copy of a model under one transform node, or null if the model is unavailable. */
  create(name: string, nodeName: string): TransformNode | null {
    const container = this.containers.get(name);
    if (!container) return null;
    const node = new TransformNode(nodeName, this.scene);
    const entries = container.instantiateModelsToScene((source) => `${nodeName}-${source}`, false);
    for (const root of entries.rootNodes) root.parent = node;
    return node;
  }

  dispose(): void {
    for (const c of this.containers.values()) c.dispose();
    this.containers.clear();
  }
}
