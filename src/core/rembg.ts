import * as child_process from "child_process";
import fs from "fs";
import path from "path";

export function removeBackground(inputPath: string): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath).toLowerCase();
  const outputPath = path.join(dir, "image.png");

  console.log(`Removing background for ${inputPath} using rembg...`);
  if (ext === ".png") {
    // Input is already PNG, write to a temporary file first and then replace to avoid truncation or partial write issues
    const tempPath = path.join(dir, "image_temp.png");
    try {
      child_process.execSync(`rembg i "${inputPath}" "${tempPath}"`, {
        stdio: "inherit",
      });
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, inputPath);
        console.log(`Successfully removed background for PNG: ${inputPath}`);
      } else {
        console.warn(
          `Background removal succeeded but output file ${tempPath} was not created.`
        );
      }
    } catch (err) {
      console.error(
        `Failed to remove background for ${inputPath} using rembg:`,
        err
      );
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
    return inputPath;
  } else {
    // Input is not PNG (e.g. JPG or WebP), write directly to image.png and delete the original non-PNG image
    try {
      child_process.execSync(`rembg i "${inputPath}" "${outputPath}"`, {
        stdio: "inherit",
      });
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(inputPath);
        console.log(
          `Successfully removed background and deleted original non-PNG image: ${inputPath} -> ${outputPath}`
        );
      } else {
        console.warn(
          `Background removal succeeded but output file ${outputPath} was not created.`
        );
      }
    } catch (err) {
      console.error(
        `Failed to remove background for ${inputPath} using rembg:`,
        err
      );
    }
    return outputPath;
  }
}
