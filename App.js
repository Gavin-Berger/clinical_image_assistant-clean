import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
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

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

const URGENCY_CONFIG = {
  emergency: {
    label: "Call 911 immediately",
    color: "#D62828",
    bgColor: "#FFF0F0",
    icon: "warning",
  },
  urgent: {
    label: "Urgent medical follow-up",
    color: "#E07B00",
    bgColor: "#FFF8EE",
    icon: "priority-high",
  },
  routine: {
    label: "Routine clinical review",
    color: "#2563EB",
    bgColor: "#EFF6FF",
    icon: "event-available",
  },
  informational: {
    label: "Informational guidance",
    color: "#2A7D4F",
    bgColor: "#EDFBF4",
    icon: "info",
  },
};

const CLINICAL_PROMPT = `You are a clinical AI assistant integrated into a telehealth mobile app.

When shown an image, analyze it for medically relevant findings.

You MUST return valid JSON with this exact structure:
{
  "urgency": "emergency | urgent | routine | informational",
  "summary": "Plain-language 2-sentence description for the patient",
  "clinical_notes": "Clinical observations in structured format",
  "recommended_action": "Specific next step for the patient",
  "disclaimer": "Always remind the user this is not a diagnosis"
}

Rules:
- Never diagnose.
- Always recommend professional evaluation.
- For wounds: assess visible size, depth, color, redness, swelling, discharge, and other visible signs of infection.
- For medications: identify by visible imprint, color, shape only.
- For documents: extract key visible values like dosage, dates, and instructions, then explain them in plain English.
- If urgency is emergency, advise calling 911 immediately.
- Be cautious, clear, and patient-safe.
- Return JSON only. No markdown. No extra commentary.`;

const CLINICAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    urgency: {
      type: "string",
      enum: ["emergency", "urgent", "routine", "informational"],
    },
    summary: { type: "string" },
    clinical_notes: { type: "string" },
    recommended_action: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: [
    "urgency",
    "summary",
    "clinical_notes",
    "recommended_action",
    "disclaimer",
  ],
};

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
      ])
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
        {[...Array(6)].map((_, i) => (
          <View key={i} style={scanStyles.gridLine} />
        ))}
      </View>

      <Text style={scanStyles.scanLabel}>RUNNING CLINICAL ANALYSIS</Text>
    </View>
  );
};

const InfoCard = ({ title, children, danger = false }) => (
  <View style={styles.resultCard}>
    <Text style={styles.resultHeading}>{title}</Text>
    <Text style={[styles.resultText, danger && styles.dangerText]}>
      {children}
    </Text>
  </View>
);

const UrgencyBadge = ({ urgency }) => {
  const config = URGENCY_CONFIG[urgency];
  if (!config) return null;

  return (
    <View style={[styles.urgencyBadge, { backgroundColor: config.bgColor }]}>
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
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const resetState = () => {
    setImageUri(null);
    setAnalysis(null);
    setShowRawJson(false);
    setLoading(false);
  };

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow photo library access first.");
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
      Alert.alert("Image Error", error.message || "Could not open the photo library.");
    }
  };

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
      Alert.alert("Camera Error", error.message || "Could not open the camera.");
    }
  };

  const getMimeType = (uri = "") => {
    const lower = uri.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".heic")) return "image/heic";
    return "image/jpeg";
  };

  const analyzeImage = async () => {
    if (!imageUri) {
      Alert.alert("No Image", "Please select or take a photo first.");
      return;
    }

    if (!OPENAI_API_KEY) {
      Alert.alert(
        "Missing API Key",
        "Add EXPO_PUBLIC_OPENAI_API_KEY to your .env file and reload the app."
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

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error?.message || "The analysis request failed.");
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
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="biotech" size={28} color="#00C896" />
          <Text style={styles.title}>Clinical AI Assistant</Text>
        </View>
        <Text style={styles.subtitle}>Telehealth Clinical Image Analysis</Text>

        <View style={styles.introCard}>
          <Text style={styles.introHeading}>What this app does</Text>
          <Text style={styles.introText}>
            Upload or capture an image of a wound, medication, or medical document.
            The app returns structured clinical JSON and presents it in a patient-friendly
            telehealth layout.
          </Text>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={pickImage}>
            <MaterialIcons name="photo-library" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn} onPress={takePhoto}>
            <MaterialIcons name="camera-alt" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Camera</Text>
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
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name="search" size={20} color="#fff" />
                <Text style={styles.analyzeBtnText}>Analyze Image</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.clearBtn} onPress={resetState}>
            <MaterialIcons name="restart-alt" size={20} color="#1E3A5F" />
            <Text style={styles.clearBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {analysis ? (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultHeading}>Urgency</Text>
              <UrgencyBadge urgency={analysis.urgency} />
            </View>

            <InfoCard title="Summary">{analysis.summary}</InfoCard>
            <InfoCard title="Clinical Notes">{analysis.clinical_notes}</InfoCard>
            <InfoCard title="Recommended Action">
              {analysis.recommended_action}
            </InfoCard>
            <InfoCard title="Disclaimer" danger>
              {analysis.disclaimer}
            </InfoCard>

            <TouchableOpacity
              style={styles.rawJsonToggle}
              onPress={() => setShowRawJson((prev) => !prev)}
            >
              <MaterialIcons
                name={showRawJson ? "expand-less" : "expand-more"}
                size={20}
                color="#1E3A5F"
              />
              <Text style={styles.rawJsonToggleText}>
                {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
              </Text>
            </TouchableOpacity>

            {showRawJson ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultHeading}>Raw JSON</Text>
                <Text style={styles.jsonText}>
                  {JSON.stringify(analysis, null, 2)}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={styles.disclaimer}>
          This demo is for class presentation purposes only and is not a diagnosis.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const scanStyles = StyleSheet.create({
  wrapper: {
    width: 300,
    height: 300,
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 20,
    backgroundColor: "#0a0a14",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    opacity: 0.85,
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
    backgroundColor: "#00FFB3",
    shadowColor: "#00FFB3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-evenly",
    opacity: 0.08,
  },
  gridLine: {
    height: 1,
    backgroundColor: "#00FFB3",
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: "#00FFB3",
    zIndex: 20,
  },
  topLeft: {
    top: 10,
    left: 10,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  topRight: {
    top: 10,
    right: 10,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bottomLeft: {
    bottom: 10,
    left: 10,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bottomRight: {
    bottom: 10,
    right: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  scanLabel: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    color: "#00FFB3",
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: "700",
    zIndex: 30,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0E1B2E",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    color: "#8A99AE",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 20,
    marginTop: 2,
  },
  introCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E1EAF2",
  },
  introHeading: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0E1B2E",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  introText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#546375",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  secondaryButtonRow: {
    width: "100%",
    gap: 10,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1E3A5F",
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  previewImage: {
    width: 300,
    height: 300,
    borderRadius: 12,
    resizeMode: "cover",
    marginVertical: 16,
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: "#00C896",
    shadowColor: "#00C896",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  analyzeBtnDisabled: {
    backgroundColor: "#7EDCC4",
  },
  analyzeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#E8EEF4",
  },
  clearBtnText: {
    color: "#1E3A5F",
    fontSize: 15,
    fontWeight: "700",
  },
  resultCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  resultHeading: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#8A99AE",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  resultText: {
    fontSize: 15,
    color: "#1A2B40",
    lineHeight: 24,
  },
  dangerText: {
    color: "#8C2F2F",
  },
  urgencyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  urgencyBadgeTextWrap: {
    flexShrink: 1,
  },
  urgencyBadgeLevel: {
    fontSize: 15,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  urgencyBadgeLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
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
    color: "#1E3A5F",
    fontWeight: "700",
  },
  jsonText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 19,
    color: "#1A2B40",
    backgroundColor: "#F5F7FA",
    borderRadius: 10,
    padding: 12,
  },
  disclaimer: {
    fontSize: 10,
    color: "#B0BAC8",
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});