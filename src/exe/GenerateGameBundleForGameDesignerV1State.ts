import { StateSchema } from "@/core/agents/DesignerAgentV1";
import {
  InstantCharacterEffect,
  InstantLocationEffect,
  PassiveCharacterEffect,
  PassiveLocationEffect,
} from "@/core/ontology";
import { removeBackground } from "@/core/rembg";
import { slugify } from "@/utilities";
import { OpenRouter } from "@openrouter/sdk";
import { choice, multiple, object, option } from "@optique/core";
import { path as path_value, run } from "@optique/run";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import Schema from "typebox/schema";

const cliParser = object({
  state: option(
    "--state",
    path_value({ extensions: [".json"], mustExist: true })
  ),
  // effect names to generate assets for
  passiveLocationEffects: multiple(
    option("--passiveLocationEffect", choice(PassiveLocationEffect.enum))
  ),
  instantLocationEffects: multiple(
    option("--instantLocationEffect", choice(InstantLocationEffect.enum))
  ),
  passiveCharacterEffects: multiple(
    option("--passiveCharacterEffect", choice(PassiveCharacterEffect.enum))
  ),
  instantCharacterEffects: multiple(
    option("--instantCharacterEffect", choice(InstantCharacterEffect.enum))
  ),
  bundleDir: option(
    "--bundleDir",
    path_value({
      type: "directory",
      allowCreate: true,
    })
  ),
  bundleZip: option(
    "--bundleZip",
    path_value({
      type: "file",
      extensions: [".zip"],
      allowCreate: true,
      mustExist: false,
    })
  ),
});

function isAssetMissing(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return true;
  }
  const files = fs.readdirSync(directory);
  const hasImage = files.some((file) => {
    const nameLower = file.toLowerCase();
    return (
      nameLower.startsWith("image.") &&
      (nameLower.endsWith(".png") ||
        nameLower.endsWith(".jpg") ||
        nameLower.endsWith(".jpeg") ||
        nameLower.endsWith(".webp"))
    );
  });
  return !hasImage;
}

function getImageAsset(directory: string): {
  buffer: Buffer<ArrayBuffer>;
  extension: string;
} {
  if (!fs.existsSync(directory)) {
    throw new Error(`No directory: ${directory}`);
  }
  const files = fs.readdirSync(directory);
  const filename = files.flatMap((file) => {
    const filename = file.toLowerCase();
    if (
      filename.startsWith("image.") &&
      (filename.endsWith(".png") ||
        filename.endsWith(".jpg") ||
        filename.endsWith(".jpeg") ||
        filename.endsWith(".webp"))
    ) {
      return [filename];
    } else {
      return [];
    }
  })[0];
  if (filename === undefined) {
    throw new Error(`No image asset in directory: ${directory}`);
  }

  return {
    buffer: fs.readFileSync(path.join(directory, filename)),
    extension: path.extname(filename),
  };
}

async function zipDirectory(sourceDir: string, outZipPath: string) {
  const blobWriter = new BlobWriter("application/zip");
  const zipWriter = new ZipWriter(blobWriter);

  async function addFilesRecursively(currentDir: string, relativePath: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const entryRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : entry.name;
      if (entry.isDirectory()) {
        await addFilesRecursively(fullPath, entryRelativePath);
      } else if (entry.isFile()) {
        const fileData = fs.readFileSync(fullPath);
        await zipWriter.add(
          entryRelativePath,
          new Uint8ArrayReader(new Uint8Array(fileData))
        );
      }
    }
  }

  await addFilesRecursively(sourceDir, "");
  await zipWriter.close();

  const blob = await blobWriter.getData();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outZipPath, buffer);
}

async function main() {
  dotenv.config();

  const cliArgs = run(cliParser, { help: "both" });

  const state = Schema.Compile(StateSchema).Parse(
    JSON.parse(fs.readFileSync(cliArgs.state, { encoding: "utf-8" }))
  );

  const gameDefinition = state.gameDefinition;

  // Ensure bundleDir exists
  if (!fs.existsSync(cliArgs.bundleDir)) {
    fs.mkdirSync(cliArgs.bundleDir, { recursive: true });
  }

  // Write gameDefinition.json
  const gameDefPath = path.join(cliArgs.bundleDir, "gameDefinition.json");
  fs.writeFileSync(
    gameDefPath,
    JSON.stringify(gameDefinition, null, 2),
    "utf-8"
  );
  console.log(`Wrote gameDefinition.json to ${gameDefPath}`);

  // Setup OpenRouter client
  const apiKey = process.env["OPENROUTER_API_KEY"];
  const characterModel = "google/gemini-2.5-flash-image";
  const characterVariantModel = "bytedance-seed/seedream-4.5";
  const locationModel = "google/gemini-2.5-flash-image";
  const locationVariantModel = "bytedance-seed/seedream-4.5";
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not defined. Please set it in your environment or a .env file."
    );
  }
  const client = new OpenRouter({ apiKey });

  const generateCharacterImage = async (prompt: string) => {
    console.log(`Generating image with prompt: "${prompt}"`);
    const result = (await client.chat.send({
      chatRequest: {
        modalities: ["image"],
        model: characterModel,
        imageConfig: {
          aspect_ratio: "3:4",
          resolution: "1K",
        },
        messages: [
          {
            role: "user",
            content: [
              prompt,
              "Full body shot. Frontal view. Studio lighting. Plain neutral gray featureless background. Exquisite extreme-detail gritty claymation style.",
            ].join("\n\n"),
          },
        ],
      },
    })) as {
      choices: Array<{
        message: {
          images?: Array<{
            imageUrl: {
              url: string;
            };
          }>;
        };
      }>;
    };

    const imageObj = result.choices?.[0]?.message?.images?.[0];
    const dataUrl = imageObj?.imageUrl?.url;
    if (!dataUrl) {
      throw new Error(
        `Failed to generate image for prompt "${prompt}". Response: ${JSON.stringify(result)}`
      );
    }
    const matches = dataUrl.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/
    );
    if (matches === null) {
      throw new Error(
        `Failed to parse data URL from response for prompt "${prompt}"`
      );
    }

    const mimeType = matches[1]!;
    const base64Data = matches[2]!;
    const extension = mimeType.split("/")[1]!.split("+")[0]!;
    const buffer = Buffer.from(base64Data, "base64");

    return { buffer, extension };
  };

  const generateCharacterVariantImage = async (
    prompt: string,
    original: { buffer: Buffer<ArrayBuffer>; extension: string }
  ) => {
    console.log(`Generating image with prompt: "${prompt}"`);
    const result = (await client.chat.send({
      chatRequest: {
        modalities: ["image"],
        model: characterVariantModel,
        imageConfig: {
          aspect_ratio: "3:4",
          resolution: "1K",
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  prompt,
                  "Full body shot. Studio lighting. Plain neutral gray featureless background. Exquisite extreme-detail gritty claymation style.",
                ].join("\n\n"),
              },
              {
                type: "image_url",
                imageUrl: {
                  url: `data:image/${original.extension};base64,${original.buffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
      },
    })) as {
      choices: Array<{
        message: {
          images?: Array<{
            imageUrl: {
              url: string;
            };
          }>;
        };
      }>;
    };

    const imageObj = result.choices?.[0]?.message?.images?.[0];
    const dataUrl = imageObj?.imageUrl?.url;
    if (!dataUrl) {
      throw new Error(
        `Failed to generate image for prompt "${prompt}". Response: ${JSON.stringify(result)}`
      );
    }
    const matches = dataUrl.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/
    );
    if (matches === null) {
      throw new Error(
        `Failed to parse data URL from response for prompt "${prompt}"`
      );
    }

    const mimeType = matches[1]!;
    const base64Data = matches[2]!;
    const extension = mimeType.split("/")[1]!.split("+")[0]!;
    const buffer = Buffer.from(base64Data, "base64");

    return { buffer, extension };
  };

  const generateLocationImage = async (prompt: string) => {
    console.log(`Generating image with prompt: "${prompt}"`);
    const result = (await client.chat.send({
      chatRequest: {
        modalities: ["image"],
        model: locationModel,
        imageConfig: {
          aspect_ratio: "16:9",
          resolution: "1K",
        },
        messages: [
          {
            role: "user",
            content: [
              prompt,
              "Perspective: first-person, eye-level, wide-angle cinematic. Exquisite extreme-detail handcrafted claymation style.",
            ].join("\n\n"),
          },
        ],
      },
    })) as {
      choices: Array<{
        message: {
          images?: Array<{
            imageUrl: {
              url: string;
            };
          }>;
        };
      }>;
    };

    const imageObj = result.choices?.[0]?.message?.images?.[0];
    const dataUrl = imageObj?.imageUrl?.url;
    if (!dataUrl) {
      throw new Error(
        `Failed to generate image for prompt "${prompt}". Response: ${JSON.stringify(result)}`
      );
    }
    const matches = dataUrl.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/
    );
    if (matches === null) {
      throw new Error(
        `Failed to parse data URL from response for prompt "${prompt}"`
      );
    }

    const mimeType = matches[1]!;
    const base64Data = matches[2]!;
    const extension = mimeType.split("/")[1]!.split("+")[0]!;
    const buffer = Buffer.from(base64Data, "base64");

    return { buffer, extension };
  };

  const generateLocationVariantImage = async (
    prompt: string,
    original: { buffer: Buffer<ArrayBuffer>; extension: string }
  ) => {
    console.log(`Generating location variant image with prompt: "${prompt}"`);
    const result = (await client.chat.send({
      chatRequest: {
        modalities: ["image"],
        model: locationVariantModel,
        imageConfig: {
          aspect_ratio: "16:9",
          resolution: "1K",
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  prompt,
                  "Perspective: first-person, eye-level, wide-angle cinematic. Exquisite extreme-detail handcrafted claymation style.",
                ].join("\n\n"),
              },
              {
                type: "image_url",
                imageUrl: {
                  url: `data:image/${original.extension};base64,${original.buffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
      },
    })) as {
      choices: Array<{
        message: {
          images?: Array<{
            imageUrl: {
              url: string;
            };
          }>;
        };
      }>;
    };

    const imageObj = result.choices?.[0]?.message?.images?.[0];
    const dataUrl = imageObj?.imageUrl?.url;
    if (!dataUrl) {
      throw new Error(
        `Failed to generate image for prompt "${prompt}". Response: ${JSON.stringify(result)}`
      );
    }
    const matches = dataUrl.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/
    );
    if (matches === null) {
      throw new Error(
        `Failed to parse data URL from response for prompt "${prompt}"`
      );
    }

    const mimeType = matches[1]!;
    const base64Data = matches[2]!;
    const extension = mimeType.split("/")[1]!.split("+")[0]!;
    const buffer = Buffer.from(base64Data, "base64");

    return { buffer, extension };
  };

  // Parse effect options
  const passiveLocEffects = cliArgs.passiveLocationEffects
    ? cliArgs.passiveLocationEffects.map((e) => e.trim()).filter(Boolean)
    : [];
  const passiveCharEffects = cliArgs.passiveCharacterEffects
    ? cliArgs.passiveCharacterEffects.map((e) => e.trim()).filter(Boolean)
    : [];
  const instantLocEffects = cliArgs.instantLocationEffects
    ? cliArgs.instantLocationEffects.map((e) => e.trim()).filter(Boolean)
    : [];
  const instantCharEffects = cliArgs.instantCharacterEffects
    ? cliArgs.instantCharacterEffects.map((e) => e.trim()).filter(Boolean)
    : [];

  // Generate Character Assets
  const characters = Object.values(gameDefinition.story.characters || {});
  for (const char of characters) {
    console.log(`Processing assets for character: "${char.name}"`);

    const charSlug = slugify(char.name);

    // 1. Base image
    const charBaseDir = path.join(
      cliArgs.bundleDir,
      "gameAssets",
      "characters",
      charSlug
    );

    if (isAssetMissing(charBaseDir)) {
      try {
        const { buffer, extension } = await generateCharacterImage(
          char.appearanceDescription
        );
        fs.mkdirSync(charBaseDir, { recursive: true });
        const filePath = path.join(charBaseDir, `image.${extension}`);
        fs.writeFileSync(filePath, buffer);
        console.log(
          `Generated base image for character "${char.name}" -> ${filePath}`
        );
        removeBackground(filePath);
      } catch (err) {
        console.error(
          `Error generating base image for character "${char.name}":`,
          err
        );
        process.exit(1);
      }
    } else {
      console.log(
        `Base image for character "${char.name}" already exists. Skipping.`
      );
    }

    const originalCharImage = getImageAsset(charBaseDir);

    // 2. Passive effects
    for (const effect of passiveCharEffects) {
      const effectDir = path.join(
        cliArgs.bundleDir,
        "gameAssets",
        "characters",
        charSlug,
        "passiveEffects",
        slugify(effect)
      );
      if (isAssetMissing(effectDir)) {
        try {
          const { buffer, extension } = await generateCharacterVariantImage(
            `${char.appearanceDescription}. The character is in a state of: ${effect}.`,
            originalCharImage
          );
          fs.mkdirSync(effectDir, { recursive: true });
          const filePath = path.join(effectDir, `image.${extension}`);
          fs.writeFileSync(filePath, buffer);
          console.log(
            `Generated passive effect "${effect}" image for character "${char.name}" -> ${filePath}`
          );
        } catch (err) {
          console.error(
            `Error generating passive effect "${effect}" image for character "${char.name}":`,
            err
          );
        }
      } else {
        console.log(
          `Passive effect "${effect}" image for character "${char.name}" already exists. Skipping.`
        );
      }
    }

    // 3. Instant effects (using instanceEffects directory)
    for (const effect of instantCharEffects) {
      const effectDir = path.join(
        cliArgs.bundleDir,
        "gameAssets",
        "characters",
        charSlug,
        "instanceEffects",
        slugify(effect)
      );
      if (isAssetMissing(effectDir)) {
        try {
          const { buffer, extension } = await generateCharacterVariantImage(
            `${char.appearanceDescription}. The character is expressing the emotion or performing the action: ${effect}.`,
            originalCharImage
          );
          fs.mkdirSync(effectDir, { recursive: true });
          const filePath = path.join(effectDir, `image.${extension}`);
          fs.writeFileSync(filePath, buffer);
          console.log(
            `Generated instant effect "${effect}" image for character "${char.name}" -> ${filePath}`
          );
          removeBackground(filePath);
        } catch (err) {
          console.error(
            `Error generating instant effect "${effect}" image for character "${char.name}":`,
            err
          );
        }
      } else {
        console.log(
          `Instant effect "${effect}" image for character "${char.name}" already exists. Skipping.`
        );
      }
    }
  }

  // Generate Location Assets
  const locations = Object.values(gameDefinition.story.locations || {});
  for (const loc of locations) {
    console.log(`Processing assets for location: "${loc.name}"`);

    const locSlug = slugify(loc.name);

    // 1. Base image
    const locBaseDir = path.join(
      cliArgs.bundleDir,
      "gameAssets",
      "locations",
      locSlug
    );
    if (isAssetMissing(locBaseDir)) {
      try {
        const { buffer, extension } = await generateLocationImage(
          loc.appearanceDescription
        );
        fs.mkdirSync(locBaseDir, { recursive: true });
        const filePath = path.join(locBaseDir, `image.${extension}`);
        fs.writeFileSync(filePath, buffer);
        console.log(
          `Generated base image for location "${loc.name}" -> ${filePath}`
        );
      } catch (err) {
        console.error(
          `Error generating base image for location "${loc.name}":`,
          err
        );
        process.exit(1);
      }
    } else {
      console.log(
        `Base image for location "${loc.name}" already exists. Skipping.`
      );
    }

    const originalLocImage = getImageAsset(locBaseDir);

    // 2. Passive effects
    for (const effect of passiveLocEffects) {
      const effectDir = path.join(
        cliArgs.bundleDir,
        "gameAssets",
        "locations",
        locSlug,
        "passiveEffects",
        slugify(effect)
      );
      if (isAssetMissing(effectDir)) {
        try {
          const { buffer, extension } = await generateLocationVariantImage(
            `${loc.appearanceDescription}. The scene is showing the effect of: ${effect}.`,
            originalLocImage
          );
          fs.mkdirSync(effectDir, { recursive: true });
          const filePath = path.join(effectDir, `image.${extension}`);
          fs.writeFileSync(filePath, buffer);
          console.log(
            `Generated passive effect "${effect}" image for location "${loc.name}" -> ${filePath}`
          );
        } catch (err) {
          console.error(
            `Error generating passive effect "${effect}" image for location "${loc.name}":`,
            err
          );
        }
      } else {
        console.log(
          `Passive effect "${effect}" image for location "${loc.name}" already exists. Skipping.`
        );
      }
    }

    // 3. Instant effects (using instanceEffects directory)
    for (const effect of instantLocEffects) {
      const effectDir = path.join(
        cliArgs.bundleDir,
        "gameAssets",
        "locations",
        locSlug,
        "instanceEffects",
        slugify(effect)
      );
      if (isAssetMissing(effectDir)) {
        try {
          const { buffer, extension } = await generateLocationVariantImage(
            `${loc.appearanceDescription}. The scene is undergoing: ${effect}.`,
            originalLocImage
          );
          fs.mkdirSync(effectDir, { recursive: true });
          const filePath = path.join(effectDir, `image.${extension}`);
          fs.writeFileSync(filePath, buffer);
          console.log(
            `Generated instant effect "${effect}" image for location "${loc.name}" -> ${filePath}`
          );
        } catch (err) {
          console.error(
            `Error generating instant effect "${effect}" image for location "${loc.name}":`,
            err
          );
        }
      } else {
        console.log(
          `Instant effect "${effect}" image for location "${loc.name}" already exists. Skipping.`
        );
      }
    }
  }

  // Archive to bundleZip if specified
  if (cliArgs.bundleZip) {
    console.log(`Archiving ${cliArgs.bundleDir} to ${cliArgs.bundleZip}...`);
    const zipDir = path.dirname(cliArgs.bundleZip);
    if (!fs.existsSync(zipDir)) {
      fs.mkdirSync(zipDir, { recursive: true });
    }
    await zipDirectory(cliArgs.bundleDir, cliArgs.bundleZip);
    console.log(`Successfully archived to ${cliArgs.bundleZip}`);
  }

  console.log("All tasks completed!");
}

await main();
