// Asset URLs (Bun bundles each PNG and returns its served URL). CC0: see app/CREDITS.md.
import { Assets, Texture } from "pixi.js";
import circle_02 from "../assets/circle_02.png";
import circle_05 from "../assets/circle_05.png";
import enemy_A from "../assets/enemy_A.png";
import enemy_D from "../assets/enemy_D.png";
import light_01 from "../assets/light_01.png";
import light_03 from "../assets/light_03.png";
import magic_02 from "../assets/magic_02.png";
import meteor_detailedSmall from "../assets/meteor_detailedSmall.png";
import meteor_small from "../assets/meteor_small.png";
import meteor_squareDetailedLarge from "../assets/meteor_squareDetailedLarge.png";
import meteor_squareLarge from "../assets/meteor_squareLarge.png";
import nebula from "../assets/nebula.png";
import planet01 from "../assets/planet01.png";
import planet02 from "../assets/planet02.png";
import planet04 from "../assets/planet04.png";
import planet07 from "../assets/planet07.png";
import planet09 from "../assets/planet09.png";
import satellite_A from "../assets/satellite_A.png";
import ship_A from "../assets/ship_A.png";
import ship_B from "../assets/ship_B.png";
import ship_E from "../assets/ship_E.png";
import ship_H from "../assets/ship_H.png";
import ship_sidesB from "../assets/ship_sidesB.png";
import ship_sidesC from "../assets/ship_sidesC.png";
import smoke_04 from "../assets/smoke_04.png";
import spaceStation_018 from "../assets/spaceStation_018.png";
import spaceStation_028 from "../assets/spaceStation_028.png";
import sphere1 from "../assets/sphere1.png";
import star_04 from "../assets/star_04.png";
import star_08 from "../assets/star_08.png";
import starfield from "../assets/starfield.png";
import station_C from "../assets/station_C.png";
import trace_05 from "../assets/trace_05.png";

const URLS = { circle_02, circle_05, enemy_A, enemy_D, light_01, light_03, magic_02, meteor_detailedSmall, meteor_small, meteor_squareDetailedLarge, meteor_squareLarge, nebula, planet01, planet02, planet04, planet07, planet09, satellite_A, ship_A, ship_B, ship_E, ship_H, ship_sidesB, ship_sidesC, smoke_04, spaceStation_018, spaceStation_028, sphere1, star_04, star_08, starfield, station_C, trace_05 };
export type TexName = keyof typeof URLS;
export const tex = {} as Record<TexName, Texture>;
export async function loadTextures(): Promise<void> {
  await Promise.all((Object.keys(URLS) as TexName[]).map(async (k) => {
    try { tex[k] = await Assets.load<Texture>(URLS[k]); } catch { tex[k] = Texture.WHITE; }
  }));
}
