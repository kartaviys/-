plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ru.hhautoapply"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.hhautoapply"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // Постоянный ключ подписи (готовит CI: из секретов репозитория или из кэша сборки),
    // чтобы новая версия ставилась поверх старой с сохранением входов и настроек.
    val ksPath = System.getenv("HH_KEYSTORE_PATH")
    if (ksPath != null) {
        signingConfigs {
            create("persistent") {
                storeFile = file(ksPath)
                storePassword = System.getenv("HH_KEYSTORE_PASSWORD")
                keyAlias = "hhautoapply"
                keyPassword = System.getenv("HH_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (ksPath != null) signingConfig = signingConfigs.getByName("persistent")
        }
        debug {
            if (ksPath != null) signingConfig = signingConfigs.getByName("persistent")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/INDEX.LIST",
                "META-INF/versions/9/OSGI-INF/MANIFEST.MF",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("com.anthropic:anthropic-java:3.3.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
