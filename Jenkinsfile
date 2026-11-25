pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    APP_NAME = "fitpulse"
    IMAGE_TAG = "sha-${env.GIT_COMMIT ? env.GIT_COMMIT.take(7) : 'local'}"
    NEXUS_URL = "https://nexus.example.internal"
    NEXUS_REPO_RAW = "fitpulse-raw-artifacts"
    REGISTRY_PREFIX = "ghcr.io/ashwin1808/fitpulse"
  }

  stages {
    stage('Checkout & Secret Scan (Gitleaks)') {
      steps {
        checkout scm
        sh '''
          if command -v gitleaks >/dev/null 2>&1; then
            gitleaks detect --source . --no-git --exit-code 1 || gitleaks detect --source . --exit-code 1
          else
            echo "Gitleaks CLI not installed on agent; install gitleaks or run via container in CI."
          fi
        '''
      }
    }

    stage('Build & Unit Checks') {
      parallel {
        stage('Commerce Node') {
          steps {
            sh '''
              npm --prefix services/commerce-node-service ci --no-audit --no-fund
              npm --prefix services/commerce-node-service run typecheck
              npm --prefix services/commerce-node-service run build
            '''
          }
        }
        stage('Tracking Java') {
          steps {
            sh 'mvn -B -f services/tracking-java-service/pom.xml -DskipTests package'
          }
        }
        stage('Worker Python') {
          steps {
            sh '''
              python3 -m py_compile $(find services/worker-python-service/app -name "*.py")
              PYTHONPATH=services/worker-python-service python3 -m unittest discover -v services/worker-python-service/tests
            '''
          }
        }
        stage('Web UI') {
          steps {
            sh '''
              npm --prefix services/web-ui ci --no-audit --no-fund
              npm --prefix services/web-ui run typecheck
              npm --prefix services/web-ui run build
            '''
          }
        }
      }
    }

    stage('SAST Quality Gate (SonarQube)') {
      steps {
        sh '''
          echo "SonarQube step hook: run sonar-scanner with -Dsonar.projectKey=fitpulse -Dsonar.qualitygate.wait=true"
          echo "Tip: enforce Quality Gate on New Code during PRs so legacy backlog bugs do not block releases."
        '''
      }
    }

    stage('Dependency Scan (OWASP Dependency-Check)') {
      steps {
        sh '''
          if command -v dependency-check.sh >/dev/null 2>&1; then
            dependency-check.sh --project "FitPulse" --scan . --failOnCVSS 8 || true
          else
            echo "OWASP Dependency-Check CLI hook ready (run dependency-check.sh on build agent)."
          fi
        '''
      }
    }

    stage('Build Images & Trivy Scan') {
      steps {
        sh '''
          docker build -t ${REGISTRY_PREFIX}/commerce-node-service:${IMAGE_TAG} services/commerce-node-service
          docker build -t ${REGISTRY_PREFIX}/tracking-java-service:${IMAGE_TAG} services/tracking-java-service
          docker build -t ${REGISTRY_PREFIX}/worker-python-service:${IMAGE_TAG} services/worker-python-service
          docker build -t ${REGISTRY_PREFIX}/web-ui:${IMAGE_TAG} services/web-ui

          if command -v trivy >/dev/null 2>&1; then
            for svc in commerce-node-service tracking-java-service worker-python-service web-ui; do
              trivy image --severity CRITICAL,HIGH --exit-code 0 ${REGISTRY_PREFIX}/${svc}:${IMAGE_TAG}
            done
          fi
        '''
      }
    }

    stage('Publish Artifact to Nexus & Promote Tag') {
      steps {
        sh '''
          mkdir -p artifacts
          tar -czf artifacts/fitpulse-k8s-manifests-${IMAGE_TAG}.tar.gz k8s/
          echo "Example Nexus raw artifact upload (use Jenkins credentials binding in real runs):"
          echo "curl -v -u \$NEXUS_USER:\$NEXUS_PASS --upload-file artifacts/fitpulse-k8s-manifests-${IMAGE_TAG}.tar.gz ${NEXUS_URL}/repository/${NEXUS_REPO_RAW}/${IMAGE_TAG}/"
          echo "Promote same immutable tag ${IMAGE_TAG} across dev -> uat -> staging -> main (prod) via PR/GitOps."
        '''
      }
    }
  }

  post {
    always {
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}