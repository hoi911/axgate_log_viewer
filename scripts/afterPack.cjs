const fs = require("fs");
const path = require("path");

const WIN_JUNK = [
  "dxcompiler.dll",
  "dxil.dll",
  "vk_swiftshader.dll",
  "vk_swiftshader_icd.json",
  "vulkan-1.dll",
  "LICENSES.chromium.html",
];

function rm(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* missing is fine */
  }
}

exports.default = async function afterPack(context) {
  const out = context.appOutDir;
  if (context.electronPlatformName === "win32") {
    for (const name of WIN_JUNK) rm(path.join(out, name));
    fs.writeFileSync(
      path.join(out, "README-PORTABLE.txt"),
      [
        "AXGATE 로그 뷰어 — 폴더 포터블",
        "",
        "설치 없이 AXGATE-Log-Viewer.exe 를 실행하세요.",
        "ARM Windows에서는 portable-win-arm64.exe 를 쓰지 마세요. 이 zip 안의 exe 가 네이티브 ARM64 입니다.",
        "Intel/AMD 포터블 exe(portable-win-x64.exe)는 그대로 사용해도 됩니다.",
        "이미 설치본이 있으면 Setup 0.1.2 이상이 실행 중인 프로세스를 강제 종료한 뒤 덮어씁니다.",
        "",
      ].join("\r\n"),
      "utf8",
    );
  }
  if (context.electronPlatformName === "darwin") {
    const resources = path.join(out, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
    rm(path.join(resources, "LICENSES.chromium.html"));
  }
};
