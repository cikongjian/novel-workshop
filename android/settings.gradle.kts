import org.gradle.api.initialization.resolve.RepositoriesMode

// 默认只用官方仓库，避免把地区镜像强加给所有构建者。
// 需要走镜像加速时：./gradlew -PNW_USE_CN_MIRRORS=true …
// 或在本地 gradle.properties 中设置 NW_USE_CN_MIRRORS=true
// 注意：pluginManagement 在隔离作用域中先于脚本主体求值，属性需在各块内单独读取。

pluginManagement {
  val useCnMirrors = settings.providers.gradleProperty("NW_USE_CN_MIRRORS").orNull == "true"
  repositories {
    if (useCnMirrors) {
      maven { url = uri("https://mirrors.cloud.tencent.com/gradle/") }
      maven { url = uri("https://maven.aliyun.com/repository/google") }
      maven { url = uri("https://maven.aliyun.com/repository/public") }
    }
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  val useCnMirrors = settings.providers.gradleProperty("NW_USE_CN_MIRRORS").orNull == "true"
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    if (useCnMirrors) {
      maven { url = uri("https://maven.aliyun.com/repository/google") }
      maven { url = uri("https://maven.aliyun.com/repository/public") }
    }
    google()
    mavenCentral()
  }
}

rootProject.name = "novel-workshop-android"
include(":app")
