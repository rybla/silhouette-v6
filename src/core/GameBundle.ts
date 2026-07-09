import { slugify } from "@/utilities";
import {
  Data64URIWriter,
  TextWriter,
  ZipReader,
  type ReadableReader,
} from "@zip.js/zip.js";
import Type from "typebox";
import Schema from "typebox/schema";
import { CharacterName, GameDefinition, InstantCharacterEffect, InstantLocationEffect, LocationName, PassiveCharacterEffect, PassiveLocationEffect } from "@/core/ontology";

// --------------------------------

export type ImageAssetRef = Type.Static<typeof ImageAssetRef>;
export const ImageAssetRef = Type.String({
  description:
    "Reference to an image asset from the uploaded game bundle zip file.",
});

export type AudioAssetRef = Type.Static<typeof AudioAssetRef>;
export const AudioAssetRef = Type.String({
  description:
    "Reference to an audio asset from the uploaded game bundle zip file.",
});

/**
 * A GameBundle is loaded from a zip file with this internal structure:
 * ```
 * ./gameDefinition.json
 * ./gameAssets/characters/<CharacterName-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/passiveEffects/<PassiveCharacterEffect-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/passiveEffects/<PassiveCharacterEffect-slug>/audio.*
 * ./gameAssets/characters/<CharacterName-slug>/instanceEffects/<InstantCharacterEffect-slug>/image.*
 * ./gameAssets/characters/<CharacterName-slug>/instanceEffects/<InstantCharacterEffect-slug>/audio.*
 * ./gameAssets/locations/<LocationName-slug>/passiveEffects/<PassiveLocationEffect-slug>/image.*
 * ./gameAssets/locations/<LocationName-slug>/passiveEffects/<PassiveLocationEffect-slug>/audio.*
 * ./gameAssets/locations/<LocationName-slug>/instanceEffects/<InstantLocationEffect-slug>/image.*
 * ./gameAssets/locations/<LocationName-slug>/instanceEffects/<InstantLocationEffect-slug>/audio.*
 * ```
 */
export type GameBundle = Type.Static<typeof GameBundle>;
export const GameBundle = Type.Object({
  gameDefinition: GameDefinition,
  gameAssets: Type.Object({
    characters: Type.Record(
      CharacterName,
      Type.Object({
        image: Type.Optional(ImageAssetRef),
        passiveEffects: Type.Record(
          PassiveCharacterEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
        instantEffects: Type.Record(
          InstantCharacterEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
      })
    ),
    locations: Type.Record(
      LocationName,
      Type.Object({
        image: Type.Optional(ImageAssetRef),
        passiveEffects: Type.Record(
          PassiveLocationEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
        instantEffects: Type.Record(
          InstantLocationEffect,
          Type.Object({
            image: Type.Optional(ImageAssetRef),
            sound: Type.Optional(AudioAssetRef),
          })
        ),
      })
    ),
  }),
});

interface ZipEntryWithData {
  filename: string;
  directory: boolean;
  getData: <T>(writer: unknown) => Promise<T>;
}

interface CharacterAssets {
  image?: string;
  passiveEffects: Record<string, { image?: string; sound?: string }>;
  instantEffects: Record<string, { image?: string; sound?: string }>;
}

interface LocationAssets {
  image?: string;
  passiveEffects: Record<string, { image?: string; sound?: string }>;
  instantEffects: Record<string, { image?: string; sound?: string }>;
}

function getMimeType(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "m4a":
      return "audio/mp4";
    default:
      return undefined;
  }
}

export async function loadGameBundle(
  reader: ReadableReader
): Promise<GameBundle> {
  const zipReader = new ZipReader(reader);
  const entries = await zipReader.getEntries();

  // Find gameDefinition.json
  const gameDefEntry = entries.find(
    (e) =>
      e.filename.replace(/^\.\//, "").replace(/^\//, "") ===
      "gameDefinition.json"
  );
  if (!gameDefEntry) {
    throw new Error("Missing gameDefinition.json in the zip bundle");
  }

  const gameDefEntryWithData = gameDefEntry as unknown as ZipEntryWithData;
  if (!gameDefEntryWithData.getData) {
    throw new Error("Invalid zip reader: getData is missing on entry");
  }

  const gameDefText = await gameDefEntryWithData.getData<string>(
    new TextWriter()
  );
  const rawGameDef = JSON.parse(gameDefText) as unknown;
  // Parse and validate GameDefinition using Schema.Compile
  const gameDefinition = Schema.Compile(GameDefinition).Parse(rawGameDef);

  // Initialize gameAssets
  const gameAssets: {
    characters: Record<string, CharacterAssets>;
    locations: Record<string, LocationAssets>;
  } = {
    characters: {},
    locations: {},
  };

  function getOrInitCharacter(charName: string): CharacterAssets {
    if (!gameAssets.characters[charName]) {
      gameAssets.characters[charName] = {
        passiveEffects: {
          float: {},
          spin: {},
          shake: {},
        },
        instantEffects: {
          shake: {},
          spin: {},
          float: {},
          jump: {},
          fall: {},
          run: {},
          walk: {},
          happy: {},
          sad: {},
          angry: {},
          shy: {},
        },
      };
    }
    return gameAssets.characters[charName];
  }

  function getOrInitLocation(locName: string): LocationAssets {
    if (!gameAssets.locations[locName]) {
      gameAssets.locations[locName] = {
        passiveEffects: {
          dark: {},
          sunny: {},
          snow: {},
          rain: {},
          wind: {},
          shake: {},
        },
        instantEffects: {
          shake: {},
        },
      };
    }
    return gameAssets.locations[locName];
  }

  // Pre-initialize characters and locations from gameDefinition
  if (gameDefinition.story?.characters) {
    for (const charName of Object.keys(gameDefinition.story.characters)) {
      getOrInitCharacter(charName);
    }
  }

  if (gameDefinition.story?.locations) {
    for (const locName of Object.keys(gameDefinition.story.locations)) {
      getOrInitLocation(locName);
    }
  }

  // Process files in the zip
  for (const entry of entries) {
    const filename = entry.filename.replace(/^\.\//, "").replace(/^\//, "");
    if (filename === "gameDefinition.json" || entry.directory) {
      continue;
    }

    const parts = filename.split("/");
    if (parts[0] !== "gameAssets" || parts.length < 4) {
      continue;
    }

    if (!entry.getData) {
      continue;
    }

    const category = parts[1]!; // "characters" or "locations"
    const name = parts[2]!; // CharacterName or LocationName

    let originalName = name;
    if (category === "characters" && gameDefinition.story?.characters) {
      const match = Object.keys(gameDefinition.story.characters).find(
        (key) => slugify(key) === slugify(name)
      );
      if (match) {
        originalName = match;
      }
    } else if (category === "locations" && gameDefinition.story?.locations) {
      const match = Object.keys(gameDefinition.story.locations).find(
        (key) => slugify(key) === slugify(name)
      );
      if (match) {
        originalName = match;
      }
    }

    if (category === "characters") {
      const charObj = getOrInitCharacter(originalName);
      const subType = parts[3]!; // "image.*" or "passiveEffects" or "instanceEffects"/"instantEffects"

      if (subType.includes(".")) {
        const [baseName] = subType.split(".");
        if (baseName === "image") {
          const mimeType = getMimeType(filename);
          charObj.image = await (
            entry as unknown as ZipEntryWithData
          ).getData<string>(new Data64URIWriter(mimeType));
        }
      } else if (subType === "passiveEffects" && parts.length >= 6) {
        const rawEffectName = parts[4]!; // e.g. "float", "spin", "shake"
        const fileType = parts[5]!; // "image.*" or "audio.*"

        const effectName = ["float", "spin", "shake"].find(
          (e) => slugify(e) === slugify(rawEffectName)
        );

        if (effectName) {
          const effectObj = charObj.passiveEffects[effectName] || {};
          charObj.passiveEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      } else if (
        (subType === "instanceEffects" || subType === "instantEffects") &&
        parts.length >= 6
      ) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const validEffects = [
          "shake",
          "spin",
          "float",
          "jump",
          "fall",
          "run",
          "walk",
          "happy",
          "sad",
          "angry",
          "shy",
        ];
        const effectName = validEffects.find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName) {
          const effectObj = charObj.instantEffects[effectName] || {};
          charObj.instantEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      }
    } else if (category === "locations") {
      const locObj = getOrInitLocation(originalName);
      const subType = parts[3]!;

      if (subType.includes(".")) {
        const [baseName] = subType.split(".");
        if (baseName === "image") {
          const mimeType = getMimeType(filename);
          locObj.image = await (
            entry as unknown as ZipEntryWithData
          ).getData<string>(new Data64URIWriter(mimeType));
        }
      } else if (subType === "passiveEffects" && parts.length >= 6) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const validEffects = ["dark", "sunny", "snow", "rain", "wind", "shake"];
        const effectName = validEffects.find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName) {
          const effectObj = locObj.passiveEffects[effectName] || {};
          locObj.passiveEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      } else if (
        (subType === "instanceEffects" || subType === "instantEffects") &&
        parts.length >= 6
      ) {
        const rawEffectName = parts[4]!;
        const fileType = parts[5]!;

        const effectName = ["shake"].find(
          (e) => slugify(e) === slugify(rawEffectName)
        );
        if (effectName === "shake") {
          const effectObj = locObj.instantEffects[effectName] || {};
          locObj.instantEffects[effectName] = effectObj;

          const [baseName] = fileType.split(".");
          if (baseName === "image") {
            const mimeType = getMimeType(filename);
            effectObj.image = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          } else if (baseName === "audio") {
            const mimeType = getMimeType(filename);
            effectObj.sound = await (
              entry as unknown as ZipEntryWithData
            ).getData<string>(new Data64URIWriter(mimeType));
          }
        }
      }
    }
  }

  await zipReader.close();

  const finalBundle = {
    gameDefinition,
    gameAssets,
  };

  // Compile and Parse/Validate the final GameBundle
  return Schema.Compile(GameBundle).Parse(finalBundle);
}
