{{- define "kolibri-enterprise.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kolibri-enterprise.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "kolibri-enterprise.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "kolibri-enterprise.labels" -}}
app.kubernetes.io/name: {{ include "kolibri-enterprise.name" . }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "kolibri-enterprise.backendConfigName" -}}
{{ include "kolibri-enterprise.fullname" . }}-backend-config
{{- end -}}

{{- define "kolibri-enterprise.backendSecretName" -}}
{{ include "kolibri-enterprise.fullname" . }}-backend-secret
{{- end -}}

{{- define "kolibri-enterprise.frontendConfigName" -}}
{{ include "kolibri-enterprise.fullname" . }}-frontend-config
{{- end -}}

{{- define "kolibri-enterprise.logsPvcName" -}}
{{ include "kolibri-enterprise.fullname" . }}-logs
{{- end -}}
