import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

val keyPropertiesFile = rootProject.file("key.properties")
val keyProperties = Properties()
if (keyPropertiesFile.exists()) {
    keyProperties.load(FileInputStream(keyPropertiesFile))
}

android {
    namespace = "com.lanchesdobarba.barbacue"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.lanchesdobarba.barbacue"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    flavorDimensions += "restaurant"
    productFlavors {
        create("barbacue") {
            dimension = "restaurant"
            applicationId = "com.lanchesdobarba.barbacue"
            resValue("string", "app_name", "BARBACUE")
            manifestPlaceholders["appHost"] = "barbacue.cog.ia.br"
        }
        create("chelas") {
            dimension = "restaurant"
            applicationId = "com.lanchesdobarba.chelas"
            resValue("string", "app_name", "Chelas")
            manifestPlaceholders["appHost"] = "chelas.hirableaiagents.com"
        }
        create("barbadog") {
            dimension = "restaurant"
            applicationId = "com.lanchesdobarba.barbadog"
            resValue("string", "app_name", "Barbadog")
            manifestPlaceholders["appHost"] = "barbadog.hirableaiagents.com"
        }
    }

    signingConfigs {
        create("release") {
            keyAlias = keyProperties["keyAlias"] as String?
            keyPassword = keyProperties["keyPassword"] as String?
            storeFile = keyProperties["storeFile"]?.let { file("$it") }
            storePassword = keyProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
}

flutter {
    source = "../.."
}
