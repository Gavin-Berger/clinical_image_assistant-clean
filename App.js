import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { CLINICAL_PROMPT, CLINICAL_SCHEMA } from "./prompts/clinicalPrompt";

// Read the public Expo environment variable from .env
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

// Monospace font helps sell the old-computer look
const RETRO_FONT = Platform.select({
  ios: "Courier",
  android: "monospace",
  default: "monospace",
});

// Visual settings for each urgency level returned by the AI
const URGENCY_CONFIG = {
  emergency: {
    label: "Call 911 immediately",
    color: "#FF6B6B",
    bgColor: "#2C0D11",
    icon: "warning",
  },
  urgent: {
    label: "Urgent medical follow-up",
    color: "#FFD166",
    bgColor: "#2A2411",
    icon: "priority-high",
  },
  routine: {
    label: "Routine clinical review",
    color: "#7CC6FE",
    bgColor: "#102235",
    icon: "event-available",
  },
  informational: {
    label: "Informational guidance",
    color: "#7EF29A",
    bgColor: "#102419",
    icon: "info",
  },
};

// Small glowing status lights for the header
const StatusLight = ({ color }) => (
  <View style={[styles.statusLight, { backgroundColor: color }]} />
);

// Small reusable helper chip showing supported categories
const HelperChip = ({ icon, label }) => (
  <View style={styles.helperChip}>
    <MaterialIcons name={icon} size={16} color="#8CFFB8" />
    <Text style={styles.helperChipText}>{label}</Text>
  </View>
);

// Retro section header used throughout the UI
const SectionHeader = ({ title }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
);

// Top status indicator that changes as the user moves through the app
const StatusPill = ({ imageUri, loading, analysis }) => {
  let icon = "radio-button-unchecked";
  let text = "NO IMAGE SELECTED";
  let bgColor = "#17242A";
  let color = "#8EA6B3";

  if (imageUri && !loading && !analysis) {
    icon = "image";
    text = "IMAGE READY FOR ANALYSIS";
    bgColor = "#10283A";
    color = "#7CC6FE";
  }

  if (loading) {
    icon = "autorenew";
    text = "RUNNING CLINICAL ANALYSIS";
    bgColor = "#10271E";
    color = "#7EF29A";
  }

  if (analysis) {
    icon = "check-circle";
    text = "RESULTS READY";
    bgColor = "#13281B";
    color = "#9CFFAE";
  }

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: bgColor, borderColor: color },
      ]}
    >
      <MaterialIcons name={icon} size={18} color={color} />
      <Text style={[styles.statusPillText, { color }]}>{text}</Text>
    </View>
  );
};

// Full-screen scanline overlay for the CRT look
const RetroScreenOverlay = () => {
  return (
    <View pointerEvents="none" style={styles.retroOverlay}>
      {Array.from({ length: 52 }).map((_, i) => (
        <View key={i} style={styles.retroLine} />
      ))}
    </View>
  );
};

// Scanner animation shown while the request is running
const ScanAnimation = ({ imageUri }) => {
  const scanLine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLine, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [scanLine]);

  const translateY = scanLine.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 280],
  });

  return (
    <View style={scanStyles.wrapper}>
      <Image source={{ uri: imageUri }} style={scanStyles.image} />

      <View style={[scanStyles.corner, scanStyles.topLeft]} />
      <View style={[scanStyles.corner, scanStyles.topRight]} />
      <View style={[scanStyles.corner, scanStyles.bottomLeft]} />
      <View style={[scanStyles.corner, scanStyles.bottomRight]} />

      <Animated.View
        style={[scanStyles.scanLine, { transform: [{ translateY }] }]}
      >
        <View style={scanStyles.scanGlow} />
      </Animated.View>

      <View style={scanStyles.grid} pointerEvents="none">
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={scanStyles.gridLine} />
        ))}
      </View>

      <Text style={scanStyles.scanLabel}>SCANNING INPUT...</Text>
    </View>
  );
};

// Reusable card for displaying results
const InfoCard = ({ title, children, danger = false }) => (
  <View style={styles.resultCard}>
    <SectionHeader title={title} />
    <Text style={[styles.resultText, danger && styles.dangerText]}>
      {children}
    </Text>
  </View>
);

// Styled badge for the urgency level
const UrgencyBadge = ({ urgency }) => {
  const config = URGENCY_CONFIG[urgency];
  if (!config) return null;

  return (
    <View
      style={[
        styles.urgencyBadge,
        { backgroundColor: config.bgColor, borderColor: config.color },
      ]}
    >
      <MaterialIcons name={config.icon} size={22} color={config.color} />
      <View style={styles.urgencyBadgeTextWrap}>
        <Text style={[styles.urgencyBadgeLevel, { color: config.color }]}>
          {urgency}
        </Text>
        <Text style={[styles.urgencyBadgeLabel, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    </View>
  );
};

export default function App() {
  // Selected image URI
  const [imageUri, setImageUri] = useState(null);

  // Loading state while the request is running
  const [loading, setLoading] = useState(false);

  // Parsed JSON returned by the model
  const [analysis, setAnalysis] = useState(null);

  // Toggle for raw JSON display
  const [showRawJson, setShowRawJson] = useState(false);

  // Animation values for the result section
  const resultsOpacity = useRef(new Animated.Value(0)).current;
  const resultsTranslateY = useRef(new Animated.Value(18)).current;

  // Animate result cards into view after analysis is complete
  useEffect(() => {
    if (analysis) {
      resultsOpacity.setValue(0);
      resultsTranslateY.setValue(18);

      Animated.parallel([
        Animated.timing(resultsOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(resultsTranslateY, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [analysis, resultsOpacity, resultsTranslateY]);

  // Reset the whole screen back to the start
  const resetState = () => {
    setImageUri(null);
    setAnalysis(null);
    setShowRawJson(false);
    setLoading(false);
  };

  // Open the user's photo library
  const pickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access first.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length) {
        setImageUri(result.assets[0].uri);
        setAnalysis(null);
        setShowRawJson(false);
      }
    } catch (error) {
      Alert.alert(
        "Image Error",
        error.message || "Could not open the photo library.",
      );
    }
  };

  // Open the device camera
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow camera access first.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length) {
        setImageUri(result.assets[0].uri);
        setAnalysis(null);
        setShowRawJson(false);
      }
    } catch (error) {
      Alert.alert(
        "Camera Error",
        error.message || "Could not open the camera.",
      );
    }
  };

  // Infer the MIME type from the file extension
  const getMimeType = (uri = "") => {
    const lower = uri.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".heic")) return "image/heic";
    return "image/jpeg";
  };

  // Send the selected image to OpenAI and parse structured JSON
  const analyzeImage = async () => {
    if (!imageUri) {
      Alert.alert("No Image", "Please select or take a photo first.");
      return;
    }

    if (!OPENAI_API_KEY) {
      Alert.alert(
        "Missing API Key",
        "Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file and reload the app.",
      );
      return;
    }

    try {
      setLoading(true);
      setAnalysis(null);

      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        throw new Error("The selected image could not be found.");
      }

      const base64Image = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const mimeType = getMimeType(imageUri);
      const imageUrl = `data:${mimeType};base64,${base64Image}`;

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "developer",
                content: CLINICAL_PROMPT,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Analyze this image and return only valid JSON matching the required schema.",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: imageUrl,
                      detail: "high",
                    },
                  },
                ],
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "clinical_assessment",
                strict: true,
                schema: CLINICAL_SCHEMA,
              },
            },
            max_completion_tokens: 500,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error?.message || "The analysis request failed.",
        );
      }

      const content = payload?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("The AI response was empty.");
      }

      const parsed = JSON.parse(content);
      setAnalysis(parsed);
    } catch (error) {
      Alert.alert("Analysis Failed", error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <RetroScreenOverlay />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Fake old-computer title bar */}
        <View style={styles.windowBar}>
          <View style={styles.windowLights}>
            <StatusLight color="#FF5F57" />
            <StatusLight color="#FEBC2E" />
            <StatusLight color="#28C840" />
          </View>
          <Text style={styles.windowBarText}>CLINICAL_WORKSTATION.EXE</Text>
        </View>

        {/* Main app header */}
        <View style={styles.header}>
          <MaterialIcons name="biotech" size={28} color="#8CFFB8" />
          <Text style={styles.title}>Clinical Image Assistant</Text>
        </View>
        <Text style={styles.subtitle}>TELEHEALTH DIAGNOSTIC WORKSTATION</Text>

        {/* Dynamic status block */}
        <StatusPill imageUri={imageUri} loading={loading} analysis={analysis} />

        {/* Overview card */}
        <View style={styles.panel}>
          <SectionHeader title="SYSTEM OVERVIEW" />
          <Text style={styles.introText}>
            Upload or capture an image of a wound, medication, or medical
            document. The system returns structured clinical JSON and displays
            it in a patient-friendly review panel.
          </Text>

          <View style={styles.helperChipRow}>
            <HelperChip icon="healing" label="WOUND" />
            <HelperChip icon="medication" label="MEDICATION" />
            <HelperChip icon="description" label="DOCUMENT" />
          </View>
        </View>

        {/* Image input controls */}
        <View style={styles.panel}>
          <SectionHeader title="PATIENT IMAGE INPUT" />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={pickImage}>
              <MaterialIcons name="photo-library" size={20} color="#061116" />
              <Text style={styles.actionBtnText}>LOAD IMAGE</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={takePhoto}>
              <MaterialIcons name="camera-alt" size={20} color="#061116" />
              <Text style={styles.actionBtnText}>CAPTURE</Text>
            </TouchableOpacity>
          </View>

          {imageUri && !loading ? (
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
          ) : null}

          {imageUri && loading ? <ScanAnimation imageUri={imageUri} /> : null}

          <View style={styles.secondaryButtonRow}>
            <TouchableOpacity
              style={[styles.analyzeBtn, loading && styles.analyzeBtnDisabled]}
              onPress={analyzeImage}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#061116" />
              ) : (
                <>
                  <MaterialIcons name="search" size={20} color="#061116" />
                  <Text style={styles.analyzeBtnText}>RUN ANALYSIS</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.clearBtn} onPress={resetState}>
              <MaterialIcons name="restart-alt" size={20} color="#B8C7D1" />
              <Text style={styles.clearBtnText}>RESET SYSTEM</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results with animated reveal */}
        {analysis ? (
          <Animated.View
            style={{
              width: "100%",
              opacity: resultsOpacity,
              transform: [{ translateY: resultsTranslateY }],
            }}
          >
            <View style={styles.resultCard}>
              <SectionHeader title="TRIAGE STATUS" />
              <UrgencyBadge urgency={analysis.urgency} />
            </View>

            <InfoCard title="PATIENT SUMMARY">{analysis.summary}</InfoCard>
            <InfoCard title="CLINICAL NOTES">
              {analysis.clinical_notes}
            </InfoCard>
            <InfoCard title="RECOMMENDED ACTION">
              {analysis.recommended_action}
            </InfoCard>
            <InfoCard title="DISCLAIMER" danger>
              {analysis.disclaimer}
            </InfoCard>

            <TouchableOpacity
              style={styles.rawJsonToggle}
              onPress={() => setShowRawJson((prev) => !prev)}
            >
              <MaterialIcons
                name={showRawJson ? "expand-less" : "expand-more"}
                size={20}
                color="#8CFFB8"
              />
              <Text style={styles.rawJsonToggleText}>
                {showRawJson ? "HIDE RAW JSON" : "SHOW RAW JSON"}
              </Text>
            </TouchableOpacity>

            {showRawJson ? (
              <View style={styles.resultCard}>
                <SectionHeader title="RAW RESPONSE DATA" />
                <Text style={styles.jsonText}>
                  {JSON.stringify(analysis, null, 2)}
                </Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        <Text style={styles.disclaimer}>
          CLASSROOM DEMO ONLY. THIS TOOL DOES NOT PROVIDE A DIAGNOSIS.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Scanner-specific styles
const scanStyles = StyleSheet.create({
  wrapper: {
    width: 300,
    height: 300,
    borderRadius: 0,
    overflow: "hidden",
    marginVertical: 16,
    backgroundColor: "#061116",
    position: "relative",
    borderWidth: 3,
    borderColor: "#4B6770",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    opacity: 0.82,
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    zIndex: 10,
  },
  scanGlow: {
    height: 3,
    backgroundColor: "#8CFFB8",
    shadowColor: "#8CFFB8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-evenly",
    opacity: 0.09,
  },
  gridLine: {
    height: 1,
    backgroundColor: "#8CFFB8",
  },
  corner: {
    position: "absolute",
    width: 18,
    height: 18,
    borderColor: "#8CFFB8",
    zIndex: 20,
  },
  topLeft: {
    top: 8,
    left: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  topRight: {
    top: 8,
    right: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bottomLeft: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bottomRight: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  scanLabel: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    color: "#8CFFB8",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    fontFamily: RETRO_FONT,
    zIndex: 30,
  },
});

// Main screen styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#081117",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 40,
    paddingTop: 10,
  },
  retroOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    opacity: 0.08,
  },
  retroLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#8CFFB8",
  },
  windowBar: {
    width: "100%",
    backgroundColor: "#19252C",
    borderWidth: 2,
    borderColor: "#5B737D",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  windowLights: {
    flexDirection: "row",
    gap: 6,
  },
  statusLight: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#091015",
  },
  windowBarText: {
    color: "#D4E4EA",
    marginLeft: 12,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#D7FFF0",
    letterSpacing: 1,
    fontFamily: RETRO_FONT,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 11,
    color: "#7FA0AC",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 14,
    marginTop: 4,
    fontFamily: RETRO_FONT,
  },
  sectionHeader: {
    backgroundColor: "#132026",
    borderLeftWidth: 4,
    borderLeftColor: "#8CFFB8",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  sectionHeaderText: {
    color: "#CFFFE2",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    fontFamily: RETRO_FONT,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  panel: {
    width: "100%",
    backgroundColor: "#101B21",
    borderWidth: 2,
    borderColor: "#415963",
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 5,
  },
  introText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#B5C7CF",
    fontFamily: RETRO_FONT,
  },
  helperChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  helperChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#142127",
    borderWidth: 1,
    borderColor: "#44606A",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  helperChipText: {
    color: "#8CFFB8",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    width: "100%",
  },
  secondaryButtonRow: {
    width: "100%",
    gap: 10,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "#8CFFB8",
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 4,
    borderTopColor: "#D8FFE8",
    borderLeftColor: "#D8FFE8",
    borderRightColor: "#4C9B6A",
    borderBottomColor: "#3E7F58",
  },
  actionBtnText: {
    color: "#061116",
    fontWeight: "800",
    fontSize: 13,
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  previewImage: {
    width: 300,
    height: 300,
    resizeMode: "cover",
    marginVertical: 12,
    borderWidth: 3,
    borderColor: "#4B6770",
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 14,
    backgroundColor: "#FFD166",
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 4,
    borderTopColor: "#FFE7A6",
    borderLeftColor: "#FFE7A6",
    borderRightColor: "#AD8D38",
    borderBottomColor: "#8F732B",
  },
  analyzeBtnDisabled: {
    opacity: 0.7,
  },
  analyzeBtnText: {
    color: "#061116",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    fontFamily: RETRO_FONT,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 13,
    backgroundColor: "#1A2830",
    borderWidth: 2,
    borderColor: "#4C6670",
  },
  clearBtnText: {
    color: "#B8C7D1",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  resultCard: {
    width: "100%",
    backgroundColor: "#101B21",
    borderWidth: 2,
    borderColor: "#415963",
    padding: 16,
    marginBottom: 16,
  },
  resultText: {
    fontSize: 14,
    color: "#C6D8DF",
    lineHeight: 23,
    fontFamily: RETRO_FONT,
  },
  dangerText: {
    color: "#FF9B9B",
  },
  urgencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },
  urgencyBadgeTextWrap: {
    flexShrink: 1,
  },
  urgencyBadgeLevel: {
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    fontFamily: RETRO_FONT,
  },
  urgencyBadgeLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  rawJsonToggle: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rawJsonToggleText: {
    color: "#8CFFB8",
    fontWeight: "800",
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
  },
  jsonText: {
    fontFamily: RETRO_FONT,
    fontSize: 12,
    lineHeight: 19,
    color: "#8CFFB8",
    backgroundColor: "#091015",
    borderWidth: 1,
    borderColor: "#415963",
    padding: 12,
  },
  disclaimer: {
    fontSize: 10,
    color: "#708B97",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 20,
    fontFamily: RETRO_FONT,
    letterSpacing: 1,
    marginTop: 4,
  },
});
