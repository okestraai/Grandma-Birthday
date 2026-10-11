# Azure Blob Storage, emulated, for the UAT environment ONLY.
#
# WHY THIS EXISTS
# The API talks to Azure Blob Storage through @azure/storage-blob. Render has no
# Azure-Blob-compatible storage product: its own object storage is in alpha behind a
# waitlist and is S3-compatible, and MinIO (available as a Render template) is S3 too.
# Azurite is Microsoft's own emulator and is wire-compatible with the real thing, so the
# API works against it with no code change at all.
#
# NEVER USE THIS IN PRODUCTION. It is an emulator, not a storage service: no durability
# guarantees, no redundancy, no backups, no soft delete. Production must point
# AZURE_STORAGE_CONNECTION_STRING at a real Azure Storage account (see docs/deployment.md).
#
# ON RENDER'S FREE PLAN THIS STORAGE IS EPHEMERAL. Free services get no persistent disk,
# so everything written here is lost whenever the service restarts, redeploys or spins
# down after 15 minutes idle. Uploaded test photos disappear; the database rows that
# reference them do not, so the gallery will show broken media afterwards. That is expected
# for throwaway UAT. Attaching a persistent disk (a paid instance) removes it.
#
# AUTHENTICATION. Free plans have no private services, so this is reachable from the
# internet. Azurite still requires a valid SharedKey signature on every request, so set
# AZURITE_ACCOUNTS to a strong random key and treat it as a secret:
#
#   AZURITE_ACCOUNTS=uatstorage:<base64 of 32 random bytes>
#
# and point the API at it with:
#
#   AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=uatstorage;\
#     AccountKey=<same key>;BlobEndpoint=https://<this-service>.onrender.com/uatstorage;

FROM mcr.microsoft.com/azure-storage/azurite:latest

# Render assigns the port at runtime, so it has to be read from the environment rather
# than baked in. --skipApiVersionCheck keeps Azurite from rejecting newer SDK versions.
ENTRYPOINT []
CMD ["sh", "-c", "azurite-blob --blobHost 0.0.0.0 --blobPort ${PORT:-10000} --location /data --skipApiVersionCheck"]
