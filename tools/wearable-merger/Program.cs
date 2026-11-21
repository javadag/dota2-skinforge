using System.Numerics;
using System.Text;
using ValveKeyValue;
using ValveResourceFormat;
using ValveResourceFormat.Blocks;
using ValveResourceFormat.ResourceTypes;

var nearBind = false;
var checkedWearable = false;
string guestMeshGroupPrefix = "";
if (args.Length < 3) return 1;
for (int a = 3; a < args.Length; a++)
{
    if (args[a] == "--check-near-bind") { nearBind = true; checkedWearable = true; }
    else if (args[a] == "--check-weighted-bind") { checkedWearable = true; }
    else if (args[a] == "--guest-mesh-group" && a + 1 < args.Length) { guestMeshGroupPrefix = args[++a]; }
    else return 1;
}
try
{
    Merge(args[0], args[1], args[2], checkedWearable, nearBind, guestMeshGroupPrefix);
    return 0;
}
catch (Exception ex)
{
    // An unsupported model leaves the caller free to try its verified catalog.
    Console.Error.WriteLine(ex.Message);
    return 2;
}

static void Merge(string hostPath, string guestPath, string outputPath, bool checkedWearable, bool nearBind, string guestMeshGroupPrefix)
{
    // Keep the host's skeleton indices and animations. Append the guest meshes
    // and remap their bone indices onto the combined skeleton.
    using var host = new Resource { FileName = hostPath };
    using var guest = new Resource { FileName = guestPath };
    host.Read(hostPath);
    guest.Read(guestPath);

    var hostBytes = File.ReadAllBytes(hostPath);
    var guestBytes = File.ReadAllBytes(guestPath);
    var blocks = host.Blocks.Select(b => (b.Type, Payload: Slice(hostBytes, b))).ToList();
    var hostData = ReadKv(host, hostBytes, BlockType.DATA);
    var guestData = ReadKv(guest, guestBytes, BlockType.DATA);
    var hostCtrl = ReadKv(host, hostBytes, BlockType.CTRL);
    var guestCtrl = ReadKv(guest, guestBytes, BlockType.CTRL);

    var hostSkel = hostData.Data.Root["m_modelSkeleton"];
    var guestSkel = guestData.Data.Root["m_modelSkeleton"];
    var hostNames = hostSkel["m_boneName"].Values.Select(v => v.ToString()).ToList();
    var guestNames = guestSkel["m_boneName"].Values.Select(v => v.ToString()).ToArray();
    var hostCount = hostNames.Count;
    var mergedIndices = new int[guestNames.Length];
    var addedBones = new List<int>();
    for (int index = 0; index < guestNames.Length; index++)
    {
        var merged = hostNames.IndexOf(guestNames[index]);
        if (merged < 0)
        {
            merged = hostNames.Count;
            hostNames.Add(guestNames[index]);
            addedBones.Add(index);
        }
        mergedIndices[index] = merged;
    }
    var guestParents = guestSkel["m_nParent"].Values.Select(v => v.ToInt32()).ToArray();
    var hostParents = hostSkel["m_nParent"].Values.Select(v => v.ToInt32()).ToArray();
    var hostRoot = hostData.Data.Root;
    var guestRoot = guestData.Data.Root;
    var originalMeshes = hostCtrl.Data.Root["embedded_meshes"].Values.ToArray();
    var guestMeshes = guestCtrl.Data.Root["embedded_meshes"].Values.ToArray();
    var guestGroupMasks = guestRoot["m_refMeshGroupMasks"].Values.Select(v => v.ToUInt64()).ToArray();
    if (guestGroupMasks.Length < guestMeshes.Length)
        throw new Exception("Guest mesh group mask count is smaller than embedded mesh count.");
    var hasGuestMeshGroups = guestRoot.TryGetValue("m_meshGroups", out var guestGroups) && guestGroups.Values.Any();
    int[] selectedIndices;
    if (hasGuestMeshGroups)
    {
        if (string.IsNullOrEmpty(guestMeshGroupPrefix))
            throw new Exception("Guest mesh groups are not supported.");
        var guestGroupNames = guestGroups!.Values.Select(v => v.ToString()).ToArray();
        var groupIndex = Array.FindIndex(guestGroupNames, n => n.StartsWith(guestMeshGroupPrefix, StringComparison.OrdinalIgnoreCase));
        if (groupIndex < 0)
            throw new Exception($"Guest mesh group '{guestMeshGroupPrefix}' not found.");
        if (groupIndex >= 64)
            throw new Exception($"Guest mesh group index {groupIndex} exceeds 64-bit mask.");
        var selectMask = 1UL << groupIndex;
        selectedIndices = Enumerable.Range(0, guestMeshes.Length).Where(i => (guestGroupMasks[i] & selectMask) != 0).ToArray();
        if (selectedIndices.Length == 0)
            throw new Exception($"No guest meshes matched mesh group '{guestMeshGroupPrefix}'.");
    }
    else
    {
        selectedIndices = Enumerable.Range(0, guestMeshes.Length).ToArray();
    }
    var selectedIndexSet = new HashSet<int>(selectedIndices);

    HashSet<int> ProtectedGuestBones()
    {
        var protectedBones = new HashSet<int>();
        var model = (Model)guest.DataBlock!;
        if (model.GetReferenceMeshNamesAndLoD().Any()) throw new Exception("Cannot prove bone usage on an external mesh.");
        var meshes = model.GetEmbeddedMeshes().Where(m => selectedIndexSet.Contains(m.MeshIndex)).ToArray();
        if (meshes.Length == 0) throw new Exception("Cannot prove bone usage without a mesh.");
        foreach (var (mesh, index, _) in meshes)
        {
            var remap = model.GetRemapTable(index) ?? throw new Exception("Mesh has no bone remap.");
            if (mesh.Data.TryGetValue("m_attachments", out var attachments))
            {
                foreach (var attachment in attachments.Values)
                foreach (var value in attachment["value"]["m_influenceNames"].Values)
                {
                    var name = value.ToString();
                    if (name.Length == 0) continue;
                    int joint = Array.IndexOf(guestNames, name);
                    if (joint < 0 && hostNames.Take(hostCount).Contains(name)) continue;
                    if (joint < 0) throw new Exception("Unmapped guest attachment influence: " + name);
                    for (int ancestor = joint; ancestor >= 0; ancestor = guestParents[ancestor])
                        protectedBones.Add(ancestor);
                }
            }
            bool verified = false;
            foreach (var buffer in mesh.VBIB.VertexBuffers)
            {
                var indexFields = buffer.InputLayoutFields.Where(f => f.SemanticName.Equals("BLENDINDICES", StringComparison.OrdinalIgnoreCase)).ToArray();
                foreach (var field in indexFields)
                {
                    var weightFields = buffer.InputLayoutFields.Where(f => f.SemanticName.Equals("BLENDWEIGHT", StringComparison.OrdinalIgnoreCase) && f.SemanticIndex == field.SemanticIndex).ToArray();
                    if (weightFields.Length == 0)
                    {
                        var rigidIndices = VBIB.GetBlendIndicesArray(buffer, field, remap);
                        foreach (var bone in rigidIndices)
                        {
                            if (bone >= mergedIndices.Length) throw new Exception("Invalid rigid mesh remap.");
                            protectedBones.Add(bone);
                        }
                        verified = true;
                        continue;
                    }
                    if (weightFields.Length != 1)
                        throw new Exception("Unpaired blend indices in vertex buffer.");
                    var indices = VBIB.GetBlendIndicesArray(buffer, field, remap);
                    var weights = VBIB.GetBlendWeightsArray(buffer, weightFields[0]);
                    if (indices.Length != weights.Length * 4 || weights.Length != buffer.ElementCount)
                        throw new Exception("Unexpected joint weight layout.");
                    for (int v = 0; v < weights.Length; v++)
                    for (int k = 0; k < 4; k++)
                    {
                        if (weights[v][k] <= 0) continue;
                        var bone = indices[v * 4 + k];
                        if (bone >= mergedIndices.Length) throw new Exception("A weighted bone was outside the model skeleton.");
                        protectedBones.Add(bone);
                    }
                    verified = true;
                }
            }
            if (!verified) throw new Exception("No resolved blend weights for guest mesh.");
        }
        if (protectedBones.Count == 0) throw new Exception("Cannot prove unused bones on a rigid mesh.");
        foreach (var i in addedBones)
            for (int ancestor = guestParents[i]; ancestor >= 0; ancestor = guestParents[ancestor])
                protectedBones.Add(ancestor);
        return protectedBones;
    }
    HashSet<int> protectedGuestBones = null;

    var hostBind = BindTransforms(hostSkel, hostParents);
    var guestBind = BindTransforms(guestSkel, guestParents);
    for (int i = 0; i < mergedIndices.Length; i++)
    {
        var j = mergedIndices[i];
        if (j >= hostCount) continue;
        var a = hostBind[j];
        var b = guestBind[i];
        if (!Matrix4x4.Decompose(a, out var aScale, out var aRot, out var aPos) ||
            !Matrix4x4.Decompose(b, out var bScale, out var bRot, out var bPos))
            throw new Exception("Could not decompose bind pose for " + guestNames[i]);
        float distance = Vector3.Distance(aPos, bPos);
        if ((distance > (nearBind ? 1.0f : checkedWearable ? 0.25f : 0.05f) ||
             Math.Abs(Quaternion.Dot(aRot, bRot)) < (nearBind ? 0.9989f : 0.9999f) ||
             Vector3.Distance(aScale, bScale) > (checkedWearable ? 0.005f : 0.001f)) &&
            (!checkedWearable || (protectedGuestBones ??= ProtectedGuestBones()).Contains(i)))
            throw new Exception($"Different world bind pose for {guestNames[i]} (position {distance}, rotation {Quaternion.Dot(aRot,bRot)}).");
    }
    var boneUpdates = new Dictionary<string, KVObject>();
    foreach (var (key, value) in hostSkel.Children)
    {
        var guestField = guestSkel.TryGetValue(key, out var field) ? field :
            key == "m_boneScaleParent" ? KVObject.Array(Enumerable.Repeat(new KVObject(1.0f), guestNames.Length)) :
            throw new Exception("Missing guest bone field " + key);
        if (!value.IsArray || value.Values.Count() != hostCount || guestField.Values.Count() != guestNames.Length)
            throw new Exception("Unexpected bone field " + key);
        boneUpdates[key] = KVObject.Array(value.Values.Concat(addedBones.Select(i =>
            key == "m_nParent"
                ? new KVObject(guestParents[i] < 0 ? -1 : mergedIndices[guestParents[i]])
                : guestField[i])));
    }

    if (!hostSkel.TryGetValue("m_boneScaleParent", out _) && guestSkel.TryGetValue("m_boneScaleParent", out var guestScale))
    {
        if (guestScale.Values.Any(v => Math.Abs(v.ToSingle() - 1.0f) > 0.001f))
            throw new Exception("Host cannot store non-unit guest bone scales.");
    }
    var meshOffset = originalMeshes.Length;
    var blockIndices = new Dictionary<int, int>();
    int CopyMeshBlock(int oldIndex, BlockType expected)
    {
        if (guest.Blocks[oldIndex].Type != expected) throw new Exception("Unexpected mesh block type.");
        if (blockIndices.TryGetValue(oldIndex, out var mapped)) return mapped;
        var next = blocks.Count;
        blocks.Add((expected, Slice(guestBytes, guest.Blocks[oldIndex])));
        blockIndices.Add(oldIndex, next);
        return next;
    }
    KVObject MapOptionalBlock(KVObject value, BlockType type) {
        int index = value.ToInt32();
        return index == -1 ? value : new KVObject(CopyMeshBlock(index, type));
    }
    var appendedMeshes = selectedIndices.Select((index, outIndex) =>
    {
        var mesh = guestMeshes[index];
        if (mesh.TryGetValue("mesh_index", out var oldIndex))
        {
            if (oldIndex.ToInt32() != index)
                throw new Exception("Unexpected legacy guest mesh layout.");
            var bufferIndex = mesh["vbib_block"].ToInt32();
            var bufferType = guest.Blocks[bufferIndex].Type;
            if (bufferType != BlockType.MBUF && bufferType != BlockType.VBIB)
                throw new Exception("Unexpected legacy mesh buffer type.");
            var updates = new Dictionary<string, KVObject>
            {
                ["mesh_index"] = new KVObject(meshOffset + outIndex),
                ["morph_block"] = MapOptionalBlock(mesh["morph_block"], BlockType.MRPH),
                ["data_block"] = new KVObject(CopyMeshBlock(mesh["data_block"].ToInt32(), BlockType.MDAT)),
                ["vbib_block"] = new KVObject(CopyMeshBlock(bufferIndex, bufferType)),
            };
            if (mesh.TryGetValue("tools_vb_block", out var toolsBuffer))
                updates["tools_vb_block"] = MapOptionalBlock(toolsBuffer, BlockType.TBUF);
            return Change(mesh, updates);
        }

        if (mesh["m_nMeshIndex"].ToInt32() != index)
            throw new Exception("Unexpected guest mesh layout.");
        KVObject CopyBuffers(string key, BlockType expected) => KVObject.Array(mesh[key].Values.Select(buffer =>
            Change(buffer, new() { ["m_nBlockIndex"] = new KVObject(CopyMeshBlock(buffer["m_nBlockIndex"].ToInt32(), expected)) })));
        return Change(mesh, new()
        {
            ["m_nMeshIndex"] = new KVObject(meshOffset + outIndex),
            ["m_nMorphBlock"] = MapOptionalBlock(mesh["m_nMorphBlock"], BlockType.MRPH),
            ["m_nDataBlock"] = new KVObject(CopyMeshBlock(mesh["m_nDataBlock"].ToInt32(), BlockType.MDAT)),
            ["m_vertexBuffers"] = CopyBuffers("m_vertexBuffers", BlockType.MVTX),
            ["m_indexBuffers"] = CopyBuffers("m_indexBuffers", BlockType.MIDX),
        });
    }).ToArray();

    var hostRemap = hostRoot["m_remappingTable"].Values.ToArray();

    var guestRemap = guestRoot["m_remappingTable"].Values.ToArray();
    var guestStarts = guestRoot["m_remappingTableStarts"].Values.Select(v => v.ToInt32()).ToArray();
    if (guestStarts.Length != guestMeshes.Length)
        throw new Exception("Unexpected guest remap table count.");
    var remappedGuestSlices = new List<KVObject>();
    var remappedGuestStarts = new List<KVObject>();
    foreach (var i in selectedIndices)
    {
        var mesh = guestMeshes[i];
        var dataIndex = mesh.TryGetValue("data_block", out var legacyData) ? legacyData.ToInt32() : mesh["m_nDataBlock"].ToInt32();
        var dataBlock = guest.Blocks[dataIndex];
        var md = new BinaryKV3(BlockType.Undefined) { Resource = guest, Size = dataBlock.Size };
        using var reader = new BinaryReader(new MemoryStream(Slice(guestBytes, dataBlock)));
        md.Read(reader);
        var from = guestStarts[i];
        var remapEnd = i + 1 < guestStarts.Length ? guestStarts[i + 1] : guestRemap.Length;
        var meshLength = md.Data.Root.TryGetValue("m_skeleton", out var meshBones) &&
            meshBones.IsCollection && meshBones.TryGetValue("m_bones", out var bones)
            ? bones.Values.Count() : remapEnd - from;
        if (meshLength > remapEnd - from) throw new Exception("Unexpected mesh remap table length.");
        remappedGuestStarts.Add(new KVObject(hostRemap.Length + remappedGuestSlices.Count));
        for (int j = from; j < remapEnd; j++)
        {
            var bone = guestRemap[j].ToInt32();
            if ((j >= from + meshLength && bone >= mergedIndices.Length) || (j >= from + meshLength && meshLength != 0))
            {
                remappedGuestSlices.Add(guestRemap[j]);
                continue;
            }
            if (bone >= mergedIndices.Length) throw new Exception("Unmapped guest mesh bone");
            remappedGuestSlices.Add(bone >= 0 ? new KVObject(mergedIndices[bone]) : guestRemap[j]);
        }
    }
    var dataUpdates = new Dictionary<string, KVObject>
    {
        ["m_modelSkeleton"] = Change(hostSkel, boneUpdates),
        ["m_remappingTable"] = KVObject.Array(hostRemap.Concat(remappedGuestSlices)),
        ["m_remappingTableStarts"] = KVObject.Array(hostRoot["m_remappingTableStarts"].Values.Concat(remappedGuestStarts)),
    };
    var guestLodMasks = guestRoot["m_refLODGroupMasks"].Values.ToArray();
    dataUpdates["m_refLODGroupMasks"] = KVObject.Array(hostRoot["m_refLODGroupMasks"].Values.Concat(selectedIndices.Select(i => guestLodMasks[i])));
    var hostMeshGroupNames = hostRoot.TryGetValue("m_meshGroups", out var hostMeshGroupNode)
        ? hostMeshGroupNode.Values.Select(v => v.ToString()).ToArray()
        : Array.Empty<string>();
    var autoDefaultIndex = Array.IndexOf(hostMeshGroupNames, "autodefault");
    // The host keeps its bodygroup names. Guest meshes without their own groups
    // join autodefault, which keeps them visible while the default item hides
    // the stock bodygroup they replace.
    var guestMeshGroupMasks = selectedIndices
        .Select(i => autoDefaultIndex >= 0
            ? new KVObject(1UL << autoDefaultIndex)
            : hasGuestMeshGroups ? new KVObject(ulong.MaxValue) : new KVObject(guestGroupMasks[i]))
        .ToArray();
    dataUpdates["m_refMeshGroupMasks"] = KVObject.Array(hostRoot["m_refMeshGroupMasks"].Values.Concat(guestMeshGroupMasks));
    if (guestRoot.TryGetValue("m_AnimatedMaterialAttributes", out var guestAnimated) && guestAnimated.Values.Any())
        throw new Exception("Unexpected nonempty m_AnimatedMaterialAttributes");

    if (hostRoot["m_refMeshes"].Values.Concat(guestRoot["m_refMeshes"].Values).Any(v => v.ValueType != KVValueType.Null && v.ToString().Length != 0))
        throw new Exception("Unexpected external mesh.");
    IEnumerable<KVObject> MeshReferences(KVObject model, int slots)
    {
        var references = model["m_refMeshes"].Values.ToArray();
        if (!checkedWearable) return references.Length == 0 ? references : references.Take(slots);
        if (references.Length != 0 && references.Length < slots)
            throw new Exception("Unexpected embedded mesh reference count.");
        return Enumerable.Range(0, slots).Select(_ => new KVObject("") { Flag = KVFlag.Resource });
    }
    dataUpdates["m_refMeshes"] = KVObject.Array(MeshReferences(hostRoot, originalMeshes.Length)
        .Concat(MeshReferences(guestRoot, selectedIndices.Length)));

    var hostGroups = hostRoot["m_materialGroups"].Values.ToArray();
    if (guestRoot["m_materialGroups"].Values.Any())
        throw new Exception("Guest materials require their own model skin.");
    if (hostGroups.Length > 0)
    {
        var hostMaterials = host.Blocks.OfType<ResourceExtRefList>().Single().ResourceRefInfoList
            .Where(r => r.Name.EndsWith(".vmat", StringComparison.OrdinalIgnoreCase))
            .Select(r => r.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var guestMaterials = guest.Blocks.OfType<ResourceExtRefList>().Single().ResourceRefInfoList
            .Where(r => r.Name.EndsWith(".vmat", StringComparison.OrdinalIgnoreCase)).Select(r => r.Name).ToArray();
        if (guestMaterials.Length == 0 || guestMaterials.Any(hostMaterials.Contains))
            throw new Exception("Material group overlap or missing guest materials.");
        var sharedGuestMaterials = guestMaterials.Select(name => new KVObject(name) { Flag = KVFlag.Resource }).ToArray();
        var sizes = hostGroups.Select(group => group["m_materials"].Values.Count()).Distinct().ToArray();
        if (sizes.Length != 1 || sizes[0] == 0) throw new Exception("Host material group lengths differ.");
        dataUpdates["m_materialGroups"] = KVObject.Array(hostGroups.Select(group => Change(group, new()
        {
            ["m_materials"] = KVObject.Array(group["m_materials"].Values.Concat(sharedGuestMaterials))
        })));
    }

    var mergedData = Change(hostRoot, dataUpdates);
    var mergedCtrl = Change(hostCtrl.Data.Root, new() { ["embedded_meshes"] = KVObject.Array(originalMeshes.Concat(appendedMeshes)) });
    Replace(BlockType.DATA, Encode(hostData, mergedData, BlockType.DATA));
    Replace(BlockType.CTRL, Encode(hostCtrl, mergedCtrl, BlockType.CTRL));
    if (originalMeshes.Length > 0 && selectedIndices.Length > 0)
    {
        static int DataBlockIndex(KVObject mesh) =>
            mesh.TryGetValue("data_block", out var legacy) ? legacy.ToInt32() : mesh["m_nDataBlock"].ToInt32();
        static string AttachmentName(KVObject att) =>
            att.TryGetValue("key", out var k) ? k.ToString() : att["value"]["m_name"].ToString();

        var guestAttachments = new List<KVObject>();
        var guestAttachmentNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var guestIdx in selectedIndices)
        {
            var guestMdatIdx = DataBlockIndex(guestMeshes[guestIdx]);
            var guestMdat = new BinaryKV3(BlockType.Undefined) { Resource = guest, Size = guest.Blocks[guestMdatIdx].Size };
            using (var gr = new BinaryReader(new MemoryStream(Slice(guestBytes, guest.Blocks[guestMdatIdx]))))
                guestMdat.Read(gr);
            if (!guestMdat.Data.Root.TryGetValue("m_attachments", out var guestAtts)) continue;
            foreach (var att in guestAtts.Values)
            {
                if (guestAttachmentNames.Add(AttachmentName(att))) guestAttachments.Add(att);
            }
        }
        if (guestAttachments.Count > 0)
        {
            foreach (var hostMesh in originalMeshes)
            {
                var hostMdatIdx = DataBlockIndex(hostMesh);
                var hostMdat = new BinaryKV3(BlockType.Undefined) { Resource = host, Size = host.Blocks[hostMdatIdx].Size };
                using (var hr = new BinaryReader(new MemoryStream(Slice(hostBytes, host.Blocks[hostMdatIdx]))))
                    hostMdat.Read(hr);
                var mdatRoot = hostMdat.Data.Root;
                var existing = mdatRoot.TryGetValue("m_attachments", out var hostAtts)
                    ? hostAtts.Values.ToList()
                    : new List<KVObject>();
                var seenNames = existing.Select(AttachmentName).ToHashSet(StringComparer.OrdinalIgnoreCase);
                var added = guestAttachments.Where(a => !seenNames.Contains(AttachmentName(a))).ToArray();
                if (added.Length == 0) continue;
                var mergedAtts = KVObject.Array(existing.Concat(added));
                KVObject updatedMdat = mdatRoot.ContainsKey("m_attachments")
                    ? Change(mdatRoot, new() { ["m_attachments"] = mergedAtts })
                    : KVObject.ListCollection(mdatRoot.Children.Append(new KeyValuePair<string, KVObject>("m_attachments", mergedAtts)));
                blocks[hostMdatIdx] = (BlockType.MDAT, Encode(hostMdat, updatedMdat, BlockType.MDAT));
            }
        }
    }
    var refs = host.Blocks.OfType<ResourceExtRefList>().Single();
    foreach (var item in guest.Blocks.OfType<ResourceExtRefList>().Single().ResourceRefInfoList)
    {
        var existing = refs.ResourceRefInfoList.SingleOrDefault(x => x.Id == item.Id);
        if (existing is not null && existing.Name != item.Name) throw new Exception("Duplicate resource ID.");
        if (existing is null) refs.ResourceRefInfoList.Add(item);
    }
    using (var r = new MemoryStream()) { refs.Serialize(r); Replace(BlockType.RERL, r.ToArray()); }

    using var output = new MemoryStream();
    using var writer = new BinaryWriter(output, Encoding.ASCII, leaveOpen:true);
    writer.Write(0);
    writer.Write(hostBytes.AsSpan(4,4));
    writer.Write(8);
    writer.Write(blocks.Count);
    for (int i = 0; i < blocks.Count; i++)
    {
        writer.Write(Encoding.ASCII.GetBytes(blocks[i].Type.ToString()));
        writer.Write(0);
        writer.Write(blocks[i].Payload.Length);
    }
    for (int i = 0; i < blocks.Count; i++)
    {
        while (output.Position % 16 != 0) writer.Write((byte)0);
        long start = output.Position;
        long offsetField = 20 + i * 12;
        output.Position = offsetField;
        writer.Write((uint)(start - offsetField));
        output.Position = start;
        writer.Write(blocks[i].Payload);
    }
    var end = output.Position;
    output.Position = 0;
    writer.Write((uint)end);
    var mergedBytes = output.ToArray();
    using var check = new Resource { FileName = outputPath };
    check.Read(new MemoryStream(mergedBytes));
    var checkBytes = mergedBytes;
    if (ReadKv(check, checkBytes, BlockType.CTRL).Data.Root["embedded_meshes"].Values.Count() != originalMeshes.Length + selectedIndices.Length)
        throw new Exception("Merged mesh count mismatch.");
    if (ReadKv(check, checkBytes, BlockType.DATA).Data.Root["m_modelSkeleton"]["m_boneName"].Values.Count() != hostNames.Count)
        throw new Exception("Merged skeleton count mismatch.");
    var cached = (Model)check.DataBlock!;
    var meshCount = cached.GetEmbeddedMeshes().Count();
    if (meshCount != originalMeshes.Length + selectedIndices.Length)
        throw new Exception("Decoded mesh count mismatch.");
    var selectedSet = selectedIndices.ToHashSet();
    var guestLod0Count = ((Model)guest.DataBlock!).GetEmbeddedMeshesForLod(0).Count(m => selectedSet.Contains(m.MeshIndex));
    var lod0 = cached.GetEmbeddedMeshesForLod(0).Count();
    if (lod0 != ((Model)host.DataBlock!).GetEmbeddedMeshesForLod(0).Count() + guestLod0Count)
        throw new Exception("LOD0 dropped an input mesh.");
    File.WriteAllBytes(outputPath, mergedBytes);

    static byte[] Slice(byte[] source, Block block) => source.AsSpan((int)block.Offset, (int)block.Size).ToArray();
    static BinaryKV3 ReadKv(Resource resource, byte[] bytes, BlockType type)
    {
        var block = resource.Blocks.Single(b => b.Type == type);
        var binary = new BinaryKV3(BlockType.Undefined) { Resource = resource, Size = block.Size };
        using var reader = new BinaryReader(new MemoryStream(Slice(bytes, block)));
        binary.Read(reader);
        return binary;
    }
    static KVObject Change(KVObject source, Dictionary<string, KVObject> changes)
    {
        if (changes.Keys.Except(source.Children.Select(kv => kv.Key)).Any())
            throw new Exception("Unknown field in compiled model.");
        return KVObject.ListCollection(source.Children.Select(kv => new KeyValuePair<string, KVObject>(kv.Key, changes.GetValueOrDefault(kv.Key, kv.Value))));
    }
    static byte[] Encode(BinaryKV3 template, KVObject root, BlockType type)
    {
        var target = new BinaryKV3(root, template.Data.Header.Format, type)
        {
            Resource = template.Resource,
            SerializationVersion = 5,
            SerializationCompressionMethod = KV3BinaryCompressionMethod.Uncompressed
        };
        using var stream = new MemoryStream();
        target.Serialize(stream);
        return stream.ToArray();
    }
    void Replace(BlockType type, byte[] payload)
    {
        int index = blocks.FindIndex(b => b.Type == type);
        if (index < 0) throw new Exception("Missing " + type);
        blocks[index] = (type, payload);
    }




    static Matrix4x4[] BindTransforms(KVObject skeleton, int[] parents)
    {
        var matrices = new Matrix4x4[parents.Length];
        for (int i = 0; i < parents.Length; i++)
        {
            var p = skeleton["m_bonePosParent"][i].Values.Select(v => v.ToSingle()).ToArray();
            var q = skeleton["m_boneRotParent"][i].Values.Select(v => v.ToSingle()).ToArray();
            var s = skeleton.TryGetValue("m_boneScaleParent", out var scales) ? scales[i].ToSingle() : 1.0f;
            var local = Matrix4x4.CreateScale(s)
                * Matrix4x4.CreateFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]))
                * Matrix4x4.CreateTranslation(p[0], p[1], p[2]);
            if (parents[i] >= i) throw new Exception("Unsorted input skeleton");
            matrices[i] = parents[i] < 0 ? local : local * matrices[parents[i]];
        }
        return matrices;
    }
}
