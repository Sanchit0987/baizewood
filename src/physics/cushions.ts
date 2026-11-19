import RAPIER from '@dimforge/rapier3d-compat';
import { CONTACT } from '../config/physics';
import { BALL, TABLE } from '../config/table';
import { CUSHIONS, HALF_LENGTH, HALF_WIDTH } from '../table/geometry';

/** Adds the six cushions (convex prisms with angled jaw facings) and a backstop behind the pockets. */
export function addCushions(world: RAPIER.World, groups: number): void {
  const top = BALL.radius * 2;
  const solid = (desc: RAPIER.ColliderDesc): void => {
    world.createCollider(
      desc.setCollisionGroups(groups).setRestitution(CONTACT.cushionRestitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setFriction(CONTACT.cushionFriction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max),
    );
  };
  for (const outline of CUSHIONS) {
    const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(outline.flatMap((p) => [p.x, 0, p.z, p.x, top, p.z])));
    if (hull) solid(hull);
  }
  const reach = TABLE.backstopOffset + TABLE.backstopThickness / 2;
  const t = TABLE.backstopThickness / 2;
  const r = BALL.radius;
  for (const sign of [-1, 1]) {
    solid(RAPIER.ColliderDesc.cuboid(HALF_LENGTH + reach, r, t).setTranslation(0, r, sign * (HALF_WIDTH + reach)));
    solid(RAPIER.ColliderDesc.cuboid(t, r, HALF_WIDTH + reach).setTranslation(sign * (HALF_LENGTH + reach), r, 0));
  }
}
