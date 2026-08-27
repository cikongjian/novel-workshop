plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

import java.io.File
import java.util.Properties

fun String.escapeForBuildConfig(): String = replace("\\", "\\\\").replace("\"", "\\\"")

val brandingPropertiesFile = rootProject.file("release-branding.local.properties")
val brandingProperties = Properties().apply {
  if (brandingPropertiesFile.exists()) {
    brandingPropertiesFile.inputStream().use(::load)
  }
}

val releaseSigningPropertiesFile = rootProject.file("release-signing.local.properties")
val releaseSigningProperties = Properties().apply {
  if (releaseSigningPropertiesFile.exists()) {
    releaseSigningPropertiesFile.inputStream().use(::load)
  }
}

fun localProperty(name: String): String? {
  val gradleValue = providers.gradleProperty(name).orNull
  if (!gradleValue.isNullOrBlank()) return gradleValue
  val brandingValue = brandingProperties.getProperty(name)
  if (!brandingValue.isNullOrBlank()) return brandingValue
  val signingValue = releaseSigningProperties.getProperty(name)
  if (!signingValue.isNullOrBlank()) return signingValue
  return null
}

fun signingProperty(name: String): String? {
  val gradleValue = providers.gradleProperty(name).orNull
  if (!gradleValue.isNullOrBlank()) return gradleValue
  val fileValue = releaseSigningProperties.getProperty(name)
  return fileValue?.takeIf { it.isNotBlank() }
}

val webUrl = localProperty("NW_WEB_URL") ?: "https://your-domain.example.com/"
val hotUpdateConfigUrl = localProperty("NW_HOT_UPDATE_CONFIG_URL") ?: ""
val shellUserAgentSuffix = localProperty("NW_SHELL_USER_AGENT_SUFFIX") ?: "NovelWorkshopReader/1.0 AndroidShell"
val appName = localProperty("NW_APP_NAME") ?: "叙事star"
// 产物文件名用的 ASCII 标识，与 config/brand.defaults.json 的 slug 对应
val appArtifactSlug = localProperty("NW_ARTIFACT_SLUG") ?: "novel-workshop"
val appApplicationId = localProperty("NW_APPLICATION_ID") ?: "com.novelworkshop.reader"
val appVersionCode = (localProperty("NW_VERSION_CODE") ?: "1").toInt()
val appVersionName = localProperty("NW_VERSION_NAME") ?: "1.0.0"
val releaseStoreFile = signingProperty("NW_RELEASE_STORE_FILE")
val releaseStorePassword = signingProperty("NW_RELEASE_STORE_PASSWORD")
val releaseKeyAlias = signingProperty("NW_RELEASE_KEY_ALIAS")
val releaseKeyPassword = signingProperty("NW_RELEASE_KEY_PASSWORD")
val releaseStorePath = releaseStoreFile?.let { rootProject.file(it) }
val hasCustomReleaseSigning = !releaseStoreFile.isNullOrBlank()
  && !releaseStorePassword.isNullOrBlank()
  && !releaseKeyAlias.isNullOrBlank()
  && !releaseKeyPassword.isNullOrBlank()
  && releaseStorePath?.exists() == true

android {
  namespace = "com.novelworkshop.reader"
  compileSdk = 36

  defaultConfig {
    applicationId = appApplicationId
    minSdk = 26
    targetSdk = 34
    versionCode = appVersionCode
    versionName = appVersionName
    manifestPlaceholders["appLabel"] = appName
  }

  signingConfigs {
    create("release") {
      if (hasCustomReleaseSigning) {
        storeFile = releaseStorePath
        storePassword = releaseStorePassword
        keyAlias = releaseKeyAlias
        keyPassword = releaseKeyPassword
      }
    }
  }

  buildTypes {
    debug {
      buildConfigField("String", "WEB_URL", "\"${webUrl.escapeForBuildConfig()}\"")
      buildConfigField("String", "HOT_UPDATE_CONFIG_URL", "\"${hotUpdateConfigUrl.escapeForBuildConfig()}\"")
      buildConfigField("String", "SHELL_USER_AGENT_SUFFIX", "\"${shellUserAgentSuffix.escapeForBuildConfig()}\"")
    }
    release {
      isMinifyEnabled = false
      isShrinkResources = false
      signingConfig = signingConfigs.getByName("release")
      buildConfigField("String", "WEB_URL", "\"${webUrl.escapeForBuildConfig()}\"")
      buildConfigField("String", "HOT_UPDATE_CONFIG_URL", "\"${hotUpdateConfigUrl.escapeForBuildConfig()}\"")
      buildConfigField("String", "SHELL_USER_AGENT_SUFFIX", "\"${shellUserAgentSuffix.escapeForBuildConfig()}\"")
    }
  }

  buildFeatures {
    buildConfig = true
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  sourceSets {
    getByName("main") {
      jniLibs.srcDirs("src/main/jniLibs", "../.vendor/tts/runtime/jniLibs")
      assets.srcDirs("src/main/assets", "../.vendor/tts/model")
    }
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.media:media:1.7.0")
  implementation("androidx.webkit:webkit:1.11.0")
}

val releaseStagingDir = rootProject.layout.projectDirectory.dir("releases")
val releaseArtifactBaseName = buildString {
  append(appArtifactSlug)
  append("-v")
  append(appVersionName)
  append("-")
  append(appVersionCode)
}

tasks.register<Copy>("stageReleaseApk") {
  dependsOn("assembleRelease")
  from(layout.buildDirectory.file("outputs/apk/release/app-release.apk"))
  into(releaseStagingDir)
  rename { "${releaseArtifactBaseName}-release.apk" }
}

tasks.register<Copy>("stageReleaseBundle") {
  dependsOn("bundleRelease")
  from(layout.buildDirectory.file("outputs/bundle/release/app-release.aab"))
  into(releaseStagingDir)
  rename { "${releaseArtifactBaseName}-release.aab" }
}

tasks.register("stageReleaseArtifacts") {
  dependsOn("stageReleaseApk", "stageReleaseBundle")
}

tasks.matching { it.name in setOf("assembleRelease", "bundleRelease") }.configureEach {
  doFirst {
    check(hasCustomReleaseSigning) {
      "Release signing is required. Configure NW_RELEASE_STORE_FILE, NW_RELEASE_STORE_PASSWORD, NW_RELEASE_KEY_ALIAS, and NW_RELEASE_KEY_PASSWORD."
    }
  }
}
